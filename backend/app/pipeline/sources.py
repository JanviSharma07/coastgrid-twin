"""Fetchers for free, key-less public data APIs, with an on-disk cache.

Every raw response is saved under data/raw/<region>/ so the pipeline can be re-run
without hitting the APIs again (and so results are reproducible). Delete the folder
to force a fresh download.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import time
from datetime import date, timedelta
from pathlib import Path

import httpx

from ..config import RAW_DIR, settings

log = logging.getLogger("pipeline")

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
CRW_MHW_URL = "https://pae-paha.pacioos.hawaii.edu/erddap/griddap/mhw_5km.json"


class Cache:
    def __init__(self, region: str):
        self.dir = RAW_DIR / region
        self.dir.mkdir(parents=True, exist_ok=True)

    def path(self, name: str) -> Path:
        return self.dir / f"{name}.json"

    def get(self, name: str):
        p = self.path(name)
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None

    def put(self, name: str, data) -> None:
        self.path(name).write_text(json.dumps(data), encoding="utf-8")


def _client() -> httpx.Client:
    return httpx.Client(timeout=180, headers={"User-Agent": settings.user_agent}, follow_redirects=True)


def _get_json(client: httpx.Client, url: str, params=None, tries: int = 5):
    for attempt in range(tries):
        try:
            r = client.get(url, params=params)
            if r.status_code == 429:
                wait = 60 * (attempt + 1)
                log.warning("Rate limited by %s, waiting %ss", url, wait)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, ValueError) as e:
            if attempt == tries - 1:
                raise
            log.warning("Request failed (%s), retrying...", e)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Could not fetch {url}")


# ---------------------------------------------------------------------------
# OpenStreetMap (Overpass)
# ---------------------------------------------------------------------------
def overpass(query: str, cache: Cache, name: str, tries: int = 3, timeout: float = 180) -> dict:
    if (hit := cache.get(name)) is not None:
        return hit
    last_err = None
    with httpx.Client(timeout=timeout, headers={"User-Agent": settings.user_agent}, follow_redirects=True) as c:
        for url in OVERPASS_URLS:
            for attempt in range(tries):
                try:
                    log.info("Overpass: %s (%s)", name, url)
                    r = c.post(url, data={"data": query})
                    if r.status_code in (429, 504):
                        time.sleep(30 * (attempt + 1))
                        continue
                    r.raise_for_status()
                    data = r.json()
                    cache.put(name, data)
                    return data
                except (httpx.HTTPError, ValueError) as e:
                    last_err = e
                    time.sleep(10)
    raise RuntimeError(f"Overpass query '{name}' failed: {last_err}")


def fetch_power_assets(bbox: list[float], cache: Cache) -> list[dict]:
    s, w, n, e = bbox
    q = f"""[out:json][timeout:180];
(
  nwr["power"="substation"]({s},{w},{n},{e});
  nwr["power"="plant"]({s},{w},{n},{e});
  nwr["power"="generator"]["generator:source"~"solar|battery"]["generator:output:electricity"!~"^[0-9.]+ ?(W|kW)$"]({s},{w},{n},{e});
);
out center tags;"""
    return overpass(q, cache, "osm_power")["elements"]


def fetch_hospitals(bbox: list[float], cache: Cache) -> list[dict]:
    s, w, n, e = bbox
    q = f"""[out:json][timeout:120];
nwr["amenity"="hospital"]({s},{w},{n},{e});
out center tags;"""
    return overpass(q, cache, "osm_hospitals")["elements"]


def fetch_places(bbox: list[float], cache: Cache) -> list[dict]:
    """Named neighbourhoods / suburbs, used to say which areas flood."""
    s, w, n, e = bbox
    q = f"""[out:json][timeout:120];
node["place"~"^(suburb|neighbourhood|quarter|village|town)$"]["name"]({s},{w},{n},{e});
out body;"""
    return overpass(q, cache, "osm_places", tries=1, timeout=90)["elements"]


def fetch_coastline(bbox: list[float], cache: Cache) -> list[list[list[float]]]:
    s, w, n, e = bbox
    pad = 0.1
    q = f"""[out:json][timeout:120];
way["natural"="coastline"]({s - pad},{w - pad},{n + pad},{e + pad});
out geom;"""
    els = overpass(q, cache, "osm_coastline")["elements"]
    return [[[p["lon"], p["lat"]] for p in el.get("geometry", [])] for el in els]


# ---------------------------------------------------------------------------
# Elevation (Copernicus DEM GLO-90 via Open-Meteo)
# ---------------------------------------------------------------------------
def fetch_elevations(points: list[tuple[float, float]], cache: Cache, label: str) -> list[float]:
    """points: [(lat, lon), ...] -> elevation in metres. Batches of 100 with polite pacing."""
    out: list[float] = []
    chunk = 100
    with _client() as c:
        for k in range(0, len(points), chunk):
            part = points[k:k + chunk]
            key = f"elev_{label}_" + hashlib.md5(json.dumps(part).encode()).hexdigest()[:12]
            data = cache.get(key)
            if data is None:
                log.info("Elevation %s: %d-%d of %d", label, k, k + len(part), len(points))
                data = _get_json(c, ELEVATION_URL, params={
                    "latitude": ",".join(f"{p[0]:.5f}" for p in part),
                    "longitude": ",".join(f"{p[1]:.5f}" for p in part),
                })
                cache.put(key, data)
                # Free tier counts each coordinate as a call (~600/minute): 100 points every 11 s
                time.sleep(11)
            vals = data["elevation"]
            out.extend(float(v) if v is not None and not math.isnan(float(v)) else 0.0 for v in vals)
    return out


# ---------------------------------------------------------------------------
# Ocean heat and weather
# ---------------------------------------------------------------------------
def fetch_marine_sst(lat: float, lon: float, cache: Cache) -> dict | None:
    key = f"marine_sst_{date.today().isoformat()}"
    if (hit := cache.get(key)) is not None:
        return hit
    try:
        with _client() as c:
            d = _get_json(c, MARINE_URL, params={
                "latitude": lat, "longitude": lon, "hourly": "sea_surface_temperature",
                "past_days": 92, "forecast_days": 1, "timezone": "UTC"})
        vals = [v for v in d["hourly"]["sea_surface_temperature"] if v is not None]
        if not vals:
            return None
        res = {"sst_latest_c": round(vals[-1], 2), "sst_mean_92d_c": round(sum(vals) / len(vals), 2),
               "sst_max_92d_c": round(max(vals), 2)}
        cache.put(key, res)
        return res
    except Exception as e:  # never fail the whole pipeline on an optional layer
        log.warning("Marine SST unavailable: %s", e)
        return None


def fetch_mhw(lat: float, lon: float, cache: Cache, seaward: int = 1) -> dict | None:
    """NOAA Coral Reef Watch marine heatwave category over the last 365 days (nearest ocean pixel)."""
    key = f"crw_mhw_{date.today().isoformat()}"
    if (hit := cache.get(key)) is not None:
        return hit
    start = (date.today() - timedelta(days=365)).isoformat()
    try:
        with _client() as c:
            for dlon in (0.0, 0.05 * seaward, 0.1 * seaward, 0.2 * seaward):
                q = (f"heatwave_category[({start}T12:00:00Z):1:(last)]"
                     f"[({lat:.3f}):1:({lat:.3f})][({lon + dlon:.3f}):1:({lon + dlon:.3f})]")
                d = _get_json(c, f"{CRW_MHW_URL}?{q}")
                rows = d["table"]["rows"]
                cats = [r[-1] for r in rows if r[-1] is not None]
                if cats:
                    res = {"mhw_days_last_year": int(sum(1 for v in cats if v >= 1)),
                           "mhw_category_latest": int(cats[-1]),
                           "mhw_max_category": int(max(cats)),
                           "mhw_latest_date": rows[-1][0][:10], "pixel_lon": round(lon + dlon, 3)}
                    cache.put(key, res)
                    return res
    except Exception as e:
        log.warning("NOAA CRW marine heatwave data unavailable: %s", e)
    return None


def fetch_era5_climate(lat: float, lon: float, sea_bearing: float, cache: Cache) -> dict | None:
    """Last full calendar year of ERA5: onshore wind share, humidity, temperature."""
    yr = date.today().year - 1
    key = f"era5_{yr}"
    if (hit := cache.get(key)) is not None:
        return hit
    try:
        with _client() as c:
            d = _get_json(c, ARCHIVE_URL, params={
                "latitude": lat, "longitude": lon, "start_date": f"{yr}-01-01", "end_date": f"{yr}-12-31",
                "hourly": "wind_direction_10m,relative_humidity_2m,temperature_2m", "timezone": "UTC"})
        h = d["hourly"]
        dirs = [v for v in h["wind_direction_10m"] if v is not None]
        rh = [v for v in h["relative_humidity_2m"] if v is not None]
        t = sorted(v for v in h["temperature_2m"] if v is not None)

        def onshore(wd: float) -> bool:
            diff = abs((wd - sea_bearing + 180) % 360 - 180)
            return diff <= 67.5

        res = {"year": yr, "onshore_fraction": round(sum(map(onshore, dirs)) / len(dirs), 3),
               "rh_mean": round(sum(rh) / len(rh), 1),
               "t_mean_c": round(sum(t) / len(t), 1), "t_p95_c": round(t[int(0.95 * (len(t) - 1))], 1)}
        cache.put(key, res)
        return res
    except Exception as e:
        log.warning("ERA5 climate unavailable: %s", e)
        return None


# ---------------------------------------------------------------------------
# 30 m elevation: Copernicus DEM GLO-30 (Microsoft Planetary Computer, AWS Open Data fallback)
# ---------------------------------------------------------------------------
PC_STAC_SEARCH = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_SIGN = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
AWS_COP30 = "https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"


def _tile_names(bbox: list[float]) -> list[str]:
    s, w, n, e = bbox
    names = []
    for lat in range(math.floor(s), math.floor(n - 1e-9) + 1):
        for lon in range(math.floor(w), math.floor(e - 1e-9) + 1):
            ns, ew = ("N" if lat >= 0 else "S"), ("E" if lon >= 0 else "W")
            names.append(f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM")
    return names


def _download(c: httpx.Client, url: str, dest: Path) -> None:
    tmp = dest.with_suffix(".part")
    with c.stream("GET", url) as r:
        r.raise_for_status()
        with tmp.open("wb") as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
    tmp.replace(dest)


def fetch_dem_tiles(bbox: list[float], cache: Cache) -> list[Path]:
    """Download the 1x1 degree Copernicus GLO-30 tiles covering bbox (cached). Returns local paths."""
    folder = cache.dir / "dem30"
    folder.mkdir(exist_ok=True)
    wanted = _tile_names(bbox)
    paths = [folder / f"{n}.tif" for n in wanted]
    if all(p.exists() for p in paths):
        return paths
    s, w, n, e = bbox
    hrefs: dict[str, str] = {}
    with _client() as c:
        try:  # Microsoft Planetary Computer (free, no account)
            r = c.post(PC_STAC_SEARCH, json={"collections": ["cop-dem-glo-30"], "bbox": [w, s, e, n], "limit": 20})
            r.raise_for_status()
            for item in r.json().get("features", []):
                href = item["assets"]["data"]["href"]
                name = Path(href.split("?")[0]).stem
                if name in wanted:
                    signed = _get_json(c, PC_SIGN, params={"href": href})["href"]
                    hrefs[name] = signed
            log.info("Planetary Computer: %d of %d DEM tiles found", len(hrefs), len(wanted))
        except Exception as e_:
            log.warning("Planetary Computer unavailable (%s); using AWS Open Data mirror", e_)
        for name, path in zip(wanted, paths):
            if path.exists():
                continue
            url = hrefs.get(name) or AWS_COP30.format(n=name)
            log.info("Downloading 30 m DEM tile %s (~30-60 MB)...", name)
            try:
                _download(c, url, path)
            except httpx.HTTPError:
                if name in hrefs:  # retry on the mirror
                    _download(c, AWS_COP30.format(n=name), path)
                else:
                    raise
    return paths


def fetch_dem(bbox: list[float], cache: Cache):
    """Mosaic of the 30 m DEM clipped to bbox: (elevation array north-up, affine transform)."""
    import numpy as np
    import rasterio
    from rasterio.merge import merge

    npz = cache.dir / "dem30_clip.npz"
    if npz.exists():
        d = np.load(npz)
        from affine import Affine
        return d["elev"], Affine(*d["transform"])
    paths = fetch_dem_tiles(bbox, cache)
    s, w, n, e = bbox
    srcs = [rasterio.open(p) for p in paths]
    try:
        arr, transform = merge(srcs, bounds=(w, s, e, n))
    finally:
        for src in srcs:
            src.close()
    elev = arr[0].astype("float32")
    np.savez_compressed(npz, elev=elev, transform=np.array(list(transform)[:6]))
    return elev, transform
