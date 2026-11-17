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

from ..config import DATA_DIR, MODEL, REGIONS, SCENARIO_IDS, YEARS
from ..db import (Asset, FloodZone, RegionData, RiskResult, SafeSite, SeaLevel, SessionLocal,
                  init_db, utcnow)
from ..risk import engine as E
from ..risk.geo import (CoastDistance, cells_to_geojson, coastline_geometry, flooded_cells,
                        haversine_km, sea_mask)
from ..risk.sealevel import AR6_GLOBAL_SOURCE, SeaLevelCurve, build_table, load_region_csv
from . import sources as S

log = logging.getLogger("pipeline")

TYPE_LABEL = {"substation": "Substation", "power_plant": "Power plant", "solar": "Solar plant", "battery": "Battery storage"}


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


def build(region_id: str) -> dict:
    t0 = time.time()
    R = REGIONS[region_id]
    cache = S.Cache(region_id)
    bbox = R["bbox"]
    epsg = R["utm_epsg"]
    init_db()

    # 1. OpenStreetMap layers --------------------------------------------------
    coast_lines = S.fetch_coastline(bbox, cache)
    if not coast_lines:
        raise RuntimeError("No coastline found in the region bbox")
    coast = coastline_geometry(coast_lines)
    dist = CoastDistance(coast, epsg)

    raw_assets = S.fetch_power_assets(bbox, cache)
    hospitals = [p for p in (element_point(h) for h in S.fetch_hospitals(bbox, cache)) if p]
    log.info("OSM: %d power features, %d hospitals, %d coastline ways", len(raw_assets), len(hospitals), len(coast_lines))

    assets = []
    seen = set()
    for el in raw_assets:
        tags = el.get("tags", {})
        kind = classify(tags)
        pt = element_point(el)
        if not kind or not pt:
            continue
        aid = f"osm-{el['type']}-{el['id']}"
        if aid in seen:
            continue
        seen.add(aid)
        kv = parse_voltage(tags.get("voltage"))
        name = tags.get("name:en") or tags.get("name")
        if not name:
            name = f"{TYPE_LABEL[kind]}{f' {kv:g} kV' if kv else ''} #{str(el['id'])[-5:]}"
        assets.append({"id": aid, "type": kind, "lat": pt[0], "lon": pt[1], "voltage_kv": kv,
                       "operator": tags.get("operator"), "name": name[:200]})
    if not assets:
        raise RuntimeError("No power assets found")

    # 2. Elevation: grid + assets ------------------------------------------------
    step = R["grid_step_deg"]
    s, w, n, e = bbox
    lats = np.round(np.arange(s, n + 1e-9, step), 5)
    lons = np.round(np.arange(w, e + 1e-9, step), 5)
    grid_pts = [(float(la), float(lo)) for la in lats for lo in lons]
    log.info("Elevation grid: %d x %d = %d points", len(lats), len(lons), len(grid_pts))
    elev = np.array(S.fetch_elevations(grid_pts, cache, "grid")).reshape(len(lats), len(lons))
    sea = sea_mask(lats, lons, coast, R["sea_bearing_deg"])
    elev[sea] = np.minimum(elev[sea], 0.0)

    a_elev = S.fetch_elevations([(a["lat"], a["lon"]) for a in assets], cache, "assets")

    # 3. Asset attributes ----------------------------------------------------------
    for a, z in zip(assets, a_elev):
        a["ground_elev_m"] = round(z, 2)
        a["base_elev_m"] = round(z + MODEL["default_plinth_m"], 2)
        a["dist_coast_km"] = round(dist.km(a["lat"], a["lon"]), 3)
        a["hospitals_nearby"] = sum(1 for h in hospitals
                                    if haversine_km(a["lat"], a["lon"], h[0], h[1]) <= MODEL["hospital_radius_km"])
        a["criticality"] = E.criticality(a["voltage_kv"], a["hospitals_nearby"], a["type"])
        a["subsidence_mm_yr"] = E.subsidence_rate(a["lat"], a["lon"], R["subsidence_hotspots"],
                                                  R["subsidence_peak_mm_yr"], R["subsidence_radius_km"])
    # drop features that fall in the sea (bad OSM points)
    assets = [a for a in assets if a["ground_elev_m"] > 0 or a["dist_coast_km"] > 0.2]

    # 4. Ocean and climate -----------------------------------------------------------
    olat, olon = R["ocean_point"]
    clat, clon = R["center"]
    sst = S.fetch_marine_sst(olat, olon, cache)
    mhw = S.fetch_mhw(olat, olon, cache)
    era5 = S.fetch_era5_climate(clat, clon, R["sea_bearing_deg"], cache)
    climate = E.Climate(
        mhw_days_last_year=(mhw or {}).get("mhw_days_last_year", 0),
        rh_mean=(era5 or {}).get("rh_mean", 70.0),
        onshore_fraction=(era5 or {}).get("onshore_fraction", 0.5),
    )
    ocean = {"sst": sst, "marine_heatwave": mhw, "era5": era5,
             "climate_factor": round(climate.climate_factor, 3),
             "available": {"sst": sst is not None, "mhw": mhw is not None, "era5": era5 is not None}}

    # 5. Sea level ----------------------------------------------------------------------
    rows = load_region_csv(DATA_DIR / "sealevel" / f"{region_id}.csv")
    sl_source = f"NASA Sea Level Projection Tool (IPCC AR6) for {R['name']}"
    if rows is None:
        rows, sl_source = build_table(), AR6_GLOBAL_SOURCE
    curves = {sc: SeaLevelCurve(rows, sc) for sc in SCENARIO_IDS}

    # 6. Risk for every asset x scenario x year -----------------------------------------
    results = []
    for a in assets:
        ai = E.AssetInput(a["id"], a["base_elev_m"], a["dist_coast_km"], a["criticality"], a["subsidence_mm_yr"])
        for sc in SCENARIO_IDS:
            for yr in YEARS:
                r = E.assess(ai, curves[sc], yr, climate)
                results.append({"asset_id": a["id"], "region": region_id, "scenario": sc, "year": yr, **r.dict()})

    # 7. Flood zones (median projection + allowance; subsidence hotspots lower the ground) -
    sub_grid = np.array([[E.subsidence_rate(float(la), float(lo), R["subsidence_hotspots"],
                                            R["subsidence_peak_mm_yr"], R["subsidence_radius_km"])
                          for lo in lons] for la in lats])
    zones = []
    for sc in SCENARIO_IDS:
        for yr in YEARS:
            wl = curves[sc].at(yr) + MODEL["extreme_water_allowance_m"]
            ground = elev - sub_grid * max(0, yr - E.SUBSIDENCE_START_YEAR) / 1000.0
            mask = flooded_cells(ground, sea, wl)
            gj, area = cells_to_geojson(mask, lats, lons, step, epsg)
            zones.append({"region": region_id, "scenario": sc, "year": yr, "area_km2": area, "geojson": json.dumps(gj)})

    # 8. Safe sites for new solar + battery ------------------------------------------
    subs = [a for a in assets if a["type"] == "substation"]
    safe = []
    for sc in SCENARIO_IDS:
        worst = curves[sc].at(2100, "p83") + MODEL["extreme_water_allowance_m"]
        cands = []
        for i, la in enumerate(lats):
            for j, lo in enumerate(lons):
                z = float(elev[i, j]) - float(sub_grid[i, j]) * 80 / 1000.0
                margin = z - worst
                if sea[i, j] or margin < MODEL["safe_min_margin_m"]:
                    continue
                dc = dist.km(float(la), float(lo))
                if dc < MODEL["safe_min_coast_km"]:
                    continue
                dsub = min((haversine_km(float(la), float(lo), b["lat"], b["lon"]) for b in subs), default=99)
                if dsub > MODEL["safe_max_substation_km"]:
                    continue
                score = 0.5 * min(margin / 10.0, 1.0) + 0.5 * (1 - dsub / MODEL["safe_max_substation_km"])
                cands.append((score, float(la), float(lo), float(elev[i, j]), margin, dc, dsub))
        cands.sort(reverse=True)
        picked = []
        for c in cands:
            if all(haversine_km(c[1], c[2], p[1], p[2]) >= MODEL["safe_min_spacing_km"] for p in picked):
                picked.append(c)
            if len(picked) >= MODEL["safe_max_sites"]:
                break
        for rank, c in enumerate(picked, 1):
            safe.append({"region": region_id, "scenario": sc, "rank": rank, "lat": round(c[1], 5), "lon": round(c[2], 5),
                         "ground_elev_m": round(c[3], 2), "margin_2100_m": round(c[4], 2),
                         "dist_coast_km": round(c[5], 2), "nearest_substation_km": round(c[6], 2), "score": round(c[0], 3)})

    # 9. Save -----------------------------------------------------------------------------
    with SessionLocal() as db:
        for model in (RiskResult, FloodZone, SafeSite, SeaLevel, RegionData, Asset):
            db.execute(delete(model).where(model.region == region_id))
        db.add_all(Asset(region=region_id, source="openstreetmap", **a) for a in assets)
        db.flush()
        db.add_all(SeaLevel(region=region_id, source=sl_source, **r) for r in rows)
        db.add_all(RiskResult(**r) for r in results)
        db.add_all(FloodZone(**z) for z in zones)
        db.add_all(SafeSite(**s_) for s_ in safe)
        now = utcnow()
        db.add(RegionData(region=region_id, key="grid", updated_at=now, data={
            "lats": lats.tolist(), "lons": lons.tolist(), "step": step,
            "elev": np.round(elev, 2).tolist(), "sea": sea.astype(int).tolist()}))
        db.add(RegionData(region=region_id, key="ocean", updated_at=now, data=ocean))
        db.add(RegionData(region=region_id, key="coastline", updated_at=now, data={"lines": coast_lines}))
        db.add(RegionData(region=region_id, key="build", updated_at=now, data={
            "built_at": now.isoformat(), "assets": len(assets), "hospitals": len(hospitals),
            "sea_level_source": sl_source, "grid_points": len(grid_pts), "seconds": round(time.time() - t0, 1)}))
        db.commit()

    summary = {"region": region_id, "assets": len(assets), "risk_rows": len(results),
               "flood_zones": len(zones), "safe_sites": len(safe), "ocean": ocean["available"],
               "sea_level_source": sl_source, "seconds": round(time.time() - t0, 1)}
    log.info("Done: %s", summary)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the CoastGrid Twin data for a region")
    ap.add_argument("--region", default="chennai", choices=sorted(REGIONS))
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    print(json.dumps(build(args.region), indent=2))


if __name__ == "__main__":
    main()
