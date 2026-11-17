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


def _get_json(client: httpx.Client, url: str, params=None, tries: int = 4):
    for attempt in range(tries):
        try:
            r = client.get(url, params=params)
            if r.status_code == 429:
                wait = 20 * (attempt + 1)
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
def overpass(query: str, cache: Cache, name: str) -> dict:
    if (hit := cache.get(name)) is not None:
        return hit
    last_err = None
    with _client() as c:
        for url in OVERPASS_URLS:
            for attempt in range(3):
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
                time.sleep(1.5)
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


def fetch_mhw(lat: float, lon: float, cache: Cache) -> dict | None:
    """NOAA Coral Reef Watch marine heatwave category over the last 365 days (nearest ocean pixel)."""
    key = f"crw_mhw_{date.today().isoformat()}"
    if (hit := cache.get(key)) is not None:
        return hit
    start = (date.today() - timedelta(days=365)).isoformat()
    try:
        with _client() as c:
            for dlon in (0.0, 0.05, 0.1, 0.2):
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
