"""Build the digital twin for a region: fetch data, run the risk model, store results.

Usage (from the backend folder):
    python -m app.pipeline.build --region chennai
"""
from __future__ import annotations

import argparse
import json
import logging
import time

import numpy as np
from sqlalchemy import delete

from ..config import DATA_DIR, MODEL, REGIONS, SCENARIO_IDS, SURGE_VALUES, YEARS
from ..db import (Asset, FloodZone, RegionData, RiskResult, SafeSite, SeaLevel, SessionLocal,
                  init_db, utcnow)
from ..risk import engine as E
from ..risk.geo import (CoastDistance, aggregate_dem, coast_distance_km_vec, coastline_geometry,
                        flooded_cells, grid_transform, haversine_km, haversine_km_vec, mask_to_geojson,
                        extend_sea, sample_raster, sea_mask)
from ..risk.sealevel import AR6_GLOBAL_SOURCE, SeaLevelCurve, build_table, load_region_csv
from . import sources as S

log = logging.getLogger("pipeline")

TYPE_LABEL = {"substation": "Substation", "power_plant": "Power plant", "solar": "Solar plant", "battery": "Battery storage"}
# Same-type features closer than this are one installation (OSM often maps each panel row separately)
MERGE_RADIUS_KM = {"substation": 0.15, "power_plant": 0.5, "solar": 0.5, "battery": 0.3}


def parse_voltage(v: str | None) -> float | None:
    if not v:
        return None
    best = None
    for part in str(v).replace(",", ";").split(";"):
        try:
            kv = float(part.strip()) / 1000.0
            best = kv if best is None else max(best, kv)
        except ValueError:
            continue
    return round(best, 1) if best else None


def classify(tags: dict) -> str | None:
    p = tags.get("power")
    src = (tags.get("plant:source") or tags.get("generator:source") or "").lower()
    if p == "substation":
        return "substation"
    if "battery" in src or tags.get("plant:storage") or tags.get("generator:method") == "battery":
        return "battery"
    if "solar" in src:
        return "solar"
    if p == "plant":
        return "power_plant"
    return None


def element_point(el: dict) -> tuple[float, float] | None:
    if "lat" in el:
        return el["lat"], el["lon"]
    if "center" in el:
        return el["center"]["lat"], el["center"]["lon"]
    return None


def merge_duplicates(assets: list[dict]) -> list[dict]:
    """Keep one asset per installation: prefer named, higher-voltage, plant-level features."""
    order = sorted(assets, key=lambda a: (not a["named"], -(a["voltage_kv"] or 0), not a["is_plant"]))
    kept: list[dict] = []
    for a in order:
        r = MERGE_RADIUS_KM[a["type"]]
        twin = next((k for k in kept if k["type"] == a["type"]
                     and haversine_km(a["lat"], a["lon"], k["lat"], k["lon"]) < r), None)
        if twin:
            twin["parts"] += 1
        else:
            kept.append({**a, "parts": 1})
    return kept


def build(region_id: str) -> dict:
    t0 = time.time()
    R = REGIONS[region_id]
    cache = S.Cache(region_id)
    bbox = R["bbox"]
    epsg = R["utm_epsg"]
    init_db(reset_if_outdated=True)

    # 1. OpenStreetMap layers --------------------------------------------------
    coast_lines = S.fetch_coastline(bbox, cache)
    if not coast_lines:
        raise RuntimeError("No coastline found in the region bbox")
    coast = coastline_geometry(coast_lines)
    dist = CoastDistance(coast, epsg)

    raw_assets = S.fetch_power_assets(bbox, cache)
    hosp_list = []
    for h in S.fetch_hospitals(bbox, cache):
        pt = element_point(h)
        if pt:
            t = h.get("tags", {})
            hosp_list.append({"name": (t.get("name:en") or t.get("name") or "Unnamed hospital")[:120],
                              "lat": round(pt[0], 5), "lon": round(pt[1], 5)})
    hospitals = np.array([[h["lat"], h["lon"]] for h in hosp_list] or [[0.0, 0.0]])
    places = []
    try:
        place_els = S.fetch_places(bbox, cache)
    except Exception as e:  # optional layer: public Overpass servers are sometimes busy
        log.warning("Neighbourhood names unavailable (%s); continuing without them", e)
        place_els = []
    for el in place_els:
        t = el.get("tags", {})
        name = t.get("name:en") or t.get("name")
        if name and "lat" in el and not any(p_["name"] == name for p_ in places):
            places.append({"name": name[:120], "lat": round(el["lat"], 5), "lon": round(el["lon"], 5),
                           "kind": t.get("place")})
    log.info("OSM: %d power features, %d hospitals, %d coastline ways", len(raw_assets), len(hospitals), len(coast_lines))

    found = []
    for el in raw_assets:
        tags = el.get("tags", {})
        kind = classify(tags)
        pt = element_point(el)
        if not kind or not pt:
            continue
        name = tags.get("name:en") or tags.get("name")
        found.append({"id": f"osm-{el['type']}-{el['id']}", "type": kind, "lat": pt[0], "lon": pt[1],
                      "voltage_kv": parse_voltage(tags.get("voltage")), "operator": tags.get("operator"),
                      "name": name, "named": bool(name), "is_plant": tags.get("power") == "plant"})
    assets = merge_duplicates(found)
    for a in assets:
        if not a["name"]:
            kv = a["voltage_kv"]
            a["name"] = f"{TYPE_LABEL[a['type']]}{f' {kv:g} kV' if kv else ''} #{a['id'].split('-')[-1][-5:]}"
        a["name"] = a["name"][:200]
    log.info("Assets: %d features merged into %d installations", len(found), len(assets))
    if not assets:
        raise RuntimeError("No power assets found")

    # 2. Elevation ---------------------------------------------------------------------
    try:
        dem, dem_t = S.fetch_dem(bbox, cache)
        grid, lats, lons, gt = aggregate_dem(dem, dem_t, R["dem_block"])
        step = abs(gt.a)
        a_elev = [sample_raster(dem, dem_t, a["lat"], a["lon"]) for a in assets]
        dem_source = "Copernicus DEM GLO-30 (30 m)"
    except Exception as e:  # fall back to the 90 m API grid
        log.warning("30 m DEM unavailable (%s); falling back to Open-Meteo 90 m grid", e)
        step = R["grid_step_deg"]
        s, w, n, e_ = bbox
        lats = np.round(np.arange(n, s - 1e-9, -step), 5)
        lons = np.round(np.arange(w, e_ + 1e-9, step), 5)
        pts = [(float(la), float(lo)) for la in lats for lo in lons]
        grid = np.array(S.fetch_elevations(pts, cache, "grid")).reshape(len(lats), len(lons))
        gt = grid_transform(lats, lons, step)
        a_elev = S.fetch_elevations([(a["lat"], a["lon"]) for a in assets], cache, "assets")
        dem_source = "Copernicus DEM GLO-90 via Open-Meteo (fallback)"
    grid = np.where(np.isfinite(grid), grid, 0.0)
    sea = sea_mask(lats, lons, coast, R["sea_bearing_deg"])
    grid[sea] = np.minimum(grid[sea], 0.0)
    sea = extend_sea(grid, sea)  # harbours / creeks already under water today
    log.info("Elevation grid %s cells of %.0f m from %s", grid.shape, step * 111_000, dem_source)

    # 3. Asset attributes ----------------------------------------------------------
    hosp_lat, hosp_lon = hospitals[:, 0], hospitals[:, 1]
    for a, z in zip(assets, a_elev):
        z = max(float(z), 0.0) if np.isfinite(z) else 0.0
        a["ground_elev_m"] = round(z, 2)
        a["base_elev_m"] = round(z + MODEL["default_plinth_m"], 2)
        a["dist_coast_km"] = round(dist.km(a["lat"], a["lon"]), 3)
        a["hospitals_nearby"] = int((haversine_km_vec(hosp_lat, hosp_lon, a["lat"], a["lon"]) <= MODEL["hospital_radius_km"]).sum())
        a["criticality"] = E.criticality(a["voltage_kv"], a["hospitals_nearby"], a["type"])
        a["subsidence_mm_yr"] = E.subsidence_rate(a["lat"], a["lon"], R["subsidence_hotspots"],
                                                  R["subsidence_peak_mm_yr"], R["subsidence_radius_km"])
    assets = [a for a in assets if a["ground_elev_m"] > 0 or a["dist_coast_km"] > 0.2]  # drop points in the sea

    # 4. Ocean and climate -----------------------------------------------------------
    olat, olon = R["ocean_point"]
    clat, clon = R["center"]
    sst = S.fetch_marine_sst(olat, olon, cache)
    mhw = S.fetch_mhw(olat, olon, cache, 1 if 45 <= R["sea_bearing_deg"] <= 135 else -1)
    era5 = S.fetch_era5_climate(clat, clon, R["sea_bearing_deg"], cache)
    climate = E.Climate(mhw_days_last_year=(mhw or {}).get("mhw_days_last_year", 0),
                        rh_mean=(era5 or {}).get("rh_mean", 70.0),
                        onshore_fraction=(era5 or {}).get("onshore_fraction", 0.5))
    ocean = {"sst": sst, "marine_heatwave": mhw, "era5": era5, "climate_factor": round(climate.climate_factor, 3),
             "available": {"sst": sst is not None, "mhw": mhw is not None, "era5": era5 is not None}}

    # 5. Sea level ----------------------------------------------------------------------
    rows = load_region_csv(DATA_DIR / "sealevel" / f"{region_id}.csv")
    sl_source = f"NASA Sea Level Projection Tool (IPCC AR6) for {R['name']}"
    if rows is None:
        rows, sl_source = build_table(), AR6_GLOBAL_SOURCE
    curves = {sc: SeaLevelCurve(rows, sc) for sc in SCENARIO_IDS}

    # 6. Risk: asset x scenario x year x surge -----------------------------------------
    results = []
    for a in assets:
        ai = E.AssetInput(a["id"], a["base_elev_m"], a["dist_coast_km"], a["criticality"], a["subsidence_mm_yr"])
        for sc in SCENARIO_IDS:
            for yr in YEARS:
                for sg in SURGE_VALUES:
                    r = E.assess(ai, curves[sc], yr, climate, allowance_m=sg)
                    results.append({"asset_id": a["id"], "region": region_id, "scenario": sc, "year": yr,
                                    "surge_m": sg, **r.dict()})

    # 7. Flood zones: grid lowered by subsidence, flooded where below water and connected to sea
    glat, glon = np.meshgrid(lats, lons, indexing="ij")
    sub_grid = np.zeros_like(grid)
    for h in R["subsidence_hotspots"]:
        d = haversine_km_vec(glat, glon, h["lat"], h["lon"])
        rate = np.clip(R["subsidence_peak_mm_yr"] * (1 - d / R["subsidence_radius_km"]), 0, None)
        sub_grid = np.maximum(sub_grid, rate)
    # Grid cell of each hospital / neighbourhood, to record which ones sit in flooded land
    inv = ~gt

    def cell(lat, lon):
        c, r = inv * (lon, lat)  # noqa
        r, c = int(r), int(c)
        return (r, c) if 0 <= r < grid.shape[0] and 0 <= c < grid.shape[1] else None

    hosp_cells = [cell(h["lat"], h["lon"]) for h in hosp_list]
    place_cells = [cell(p_["lat"], p_["lon"]) for p_ in places]
    places = [p_ for p_, c in zip(places, place_cells) if c is not None and not sea[c]]
    place_cells = [c for c in place_cells if c is not None and not sea[c]]
    exposure = {}
    zones = []
    for sc in SCENARIO_IDS:
        for yr in YEARS:
            ground = grid - sub_grid * max(0, yr - E.SUBSIDENCE_START_YEAR) / 1000.0
            for sg in SURGE_VALUES:
                mask = flooded_cells(ground, sea, curves[sc].at(yr) + sg)
                exposure[f"{sc}|{yr}|{sg}"] = {
                    "hospitals": [i for i, c in enumerate(hosp_cells) if c is not None and mask[c]],
                    "places": [i for i, c in enumerate(place_cells) if mask[c]],
                }
                gj, area = mask_to_geojson(mask, gt, epsg, simplify=step / 3)
                zones.append({"region": region_id, "scenario": sc, "year": yr, "surge_m": sg,
                              "area_km2": area, "geojson": json.dumps(gj)})
    log.info("Flood zones: %d layers", len(zones))

    # 8. Safe sites for new solar + battery ------------------------------------------
    subs = [a for a in assets if a["type"] == "substation"]
    land = ~sea
    d_coast = np.full(grid.shape, -1.0)
    d_coast[land] = coast_distance_km_vec(dist.coast_m, epsg, glat[land], glon[land])
    d_sub = np.full(grid.shape, 99.0)
    for b in subs:
        d_sub = np.minimum(d_sub, haversine_km_vec(glat, glon, b["lat"], b["lon"]))
    ground_2100 = grid - sub_grid * (2100 - E.SUBSIDENCE_START_YEAR) / 1000.0
    safe = []
    for sc in SCENARIO_IDS:
        worst = curves[sc].at(2100, "p83") + max(SURGE_VALUES)
        margin = ground_2100 - worst
        ok = (land & (margin >= MODEL["safe_min_margin_m"]) & (d_coast >= MODEL["safe_min_coast_km"])
              & (d_sub <= MODEL["safe_max_substation_km"]))
        score = 0.5 * np.minimum(margin / 10.0, 1.0) + 0.5 * (1 - d_sub / MODEL["safe_max_substation_km"])
        idx = np.argwhere(ok)
        cands = sorted(((float(score[i, j]), int(i), int(j)) for i, j in idx), reverse=True)
        picked = []
        for sc_, i, j in cands:
            la, lo = float(lats[i]), float(lons[j])
            if all(haversine_km(la, lo, p[1], p[2]) >= MODEL["safe_min_spacing_km"] for p in picked):
                picked.append((sc_, la, lo, i, j))
            if len(picked) >= MODEL["safe_max_sites"]:
                break
        for rank, (sc_, la, lo, i, j) in enumerate(picked, 1):
            safe.append({"region": region_id, "scenario": sc, "rank": rank, "lat": round(la, 5), "lon": round(lo, 5),
                         "ground_elev_m": round(float(grid[i, j]), 2), "margin_2100_m": round(float(margin[i, j]), 2),
                         "dist_coast_km": round(float(d_coast[i, j]), 2),
                         "nearest_substation_km": round(float(d_sub[i, j]), 2), "score": round(sc_, 3)})

    # 9. Save -----------------------------------------------------------------------------
    keep_cols = {"id", "type", "lat", "lon", "voltage_kv", "operator", "name", "ground_elev_m", "base_elev_m",
                 "dist_coast_km", "hospitals_nearby", "criticality", "subsidence_mm_yr"}
    log.info("Saving %d assets, %d risk rows, %d flood layers to the database...", len(assets), len(results), len(zones))
    with SessionLocal() as db:
        for model in (RiskResult, FloodZone, SafeSite, SeaLevel, RegionData, Asset):
            db.execute(delete(model).where(model.region == region_id))
        db.add_all(Asset(region=region_id, source="openstreetmap", **{k: a[k] for k in keep_cols}) for a in assets)
        db.flush()
        db.add_all(SeaLevel(region=region_id, source=sl_source, **r) for r in rows)
        db.add_all(RiskResult(**r) for r in results)
        db.add_all(FloodZone(**z) for z in zones)
        db.add_all(SafeSite(**s_) for s_ in safe)
        now = utcnow()
        db.add(RegionData(region=region_id, key="ocean", updated_at=now, data=ocean))
        db.add(RegionData(region=region_id, key="coastline", updated_at=now, data={"lines": coast_lines}))
        db.add(RegionData(region=region_id, key="exposure", updated_at=now,
                          data={"hospitals": hosp_list, "places": places, "flooded": exposure}))
        db.add(RegionData(region=region_id, key="build", updated_at=now, data={
            "built_at": now.isoformat(), "assets": len(assets), "osm_features": len(found),
            "hospitals": len(hosp_list), "places": len(places), "elevation_source": dem_source,
            "grid_cell_m": round(step * 111_000), "sea_level_source": sl_source,
            "seconds": round(time.time() - t0, 1)}))
        db.commit()

    lvl = {"high": 0, "medium": 0, "low": 0}
    for r in results:
        if r["scenario"] == "ssp585" and r["year"] == 2100 and r["surge_m"] == 1.5:
            lvl[r["risk_level"]] += 1
    summary = {"region": region_id, "assets": len(assets), "elevation": dem_source, "risk_rows": len(results),
               "flood_layers": len(zones), "safe_sites": len(safe), "ocean": ocean["available"],
               "ssp585_2100_surge1.5": {**lvl, "flood_km2": next(z["area_km2"] for z in zones
                                         if z["scenario"] == "ssp585" and z["year"] == 2100 and z["surge_m"] == 1.5)},
               "sea_level_source": sl_source, "seconds": round(time.time() - t0, 1)}
    log.info("Done")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the CoastGrid Twin data for a region")
    ap.add_argument("--region", default="chennai", choices=sorted(REGIONS))
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    print(json.dumps(build(args.region), indent=2))


if __name__ == "__main__":
    main()
