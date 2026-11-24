"""REST API routes. Full contract with example responses: docs/API.md"""
from __future__ import annotations

import json
import os
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import (APP_VERSION, DEFAULT_SURGE, MODEL, REGIONS, SCENARIOS, SCENARIO_IDS, SOURCES,
                     SURGE_LEVELS, SURGE_VALUES, YEARS)
from .db import Asset, FloodZone, RegionData, RiskResult, SafeSite, SeaLevel, SessionLocal
from .risk import engine as E
from .risk.sealevel import SeaLevelCurve

router = APIRouter(prefix="/api")

Scenario = Literal["ssp126", "ssp245", "ssp585"]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_region(region: str) -> str:
    if region not in REGIONS:
        raise HTTPException(404, f"Unknown region '{region}'. Available: {sorted(REGIONS)}")
    return region


def check_year(year: int) -> int:
    if year not in YEARS:
        raise HTTPException(422, f"year must be one of {YEARS}")
    return year


def check_surge(surge: float) -> float:
    if surge not in SURGE_VALUES:
        raise HTTPException(422, f"surge must be one of {SURGE_VALUES}")
    return surge


def region_blob(db: Session, region: str, key: str) -> RegionData | None:
    return db.scalar(select(RegionData).where(RegionData.region == region, RegionData.key == key))


def asset_props(a: Asset) -> dict:
    return {"id": a.id, "name": a.name, "type": a.type, "voltage_kv": a.voltage_kv, "operator": a.operator,
            "ground_elev_m": a.ground_elev_m, "base_elev_m": a.base_elev_m, "dist_coast_km": a.dist_coast_km,
            "hospitals_nearby": a.hospitals_nearby, "criticality": a.criticality,
            "subsidence_mm_yr": a.subsidence_mm_yr, "source": a.source}


def risk_props(r: RiskResult) -> dict:
    return {"risk_score": r.risk_score, "risk_level": r.risk_level, "flood_score": r.flood_score,
            "heat_score": r.heat_score, "salt_score": r.salt_score, "water_level_m": r.water_level_m,
            "margin_m": r.margin_m, "flood_year": r.flood_year, "main_threat": r.main_threat, "action": r.action}


def feature(lat: float, lon: float, props: dict) -> dict:
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


def curve_for(db: Session, region: str, scenario: str) -> SeaLevelCurve:
    rows = db.scalars(select(SeaLevel).where(SeaLevel.region == region, SeaLevel.scenario == scenario)).all()
    if not rows:
        raise HTTPException(503, "Region data not built yet. Run the pipeline.")
    return SeaLevelCurve([{"scenario": r.scenario, "year": r.year, "p17": r.p17, "p50": r.p50, "p83": r.p83}
                          for r in rows], scenario)


def climate_for(db: Session, region: str) -> E.Climate:
    blob = region_blob(db, region, "ocean")
    d = blob.data if blob else {}
    return E.Climate(mhw_days_last_year=((d.get("marine_heatwave") or {}).get("mhw_days_last_year", 0)),
                     rh_mean=((d.get("era5") or {}).get("rh_mean", 70.0)),
                     onshore_fraction=((d.get("era5") or {}).get("onshore_fraction", 0.5)))


# ---------------------------------------------------------------------------
def _clean(msg: str) -> str:
    """Remove any password from an error message before showing it."""
    return re.sub(r"://([^:/@\s]+):[^@\s]+@", r"://\1:****@", msg)[:500]


@router.get("/health", tags=["meta"])
def health():
    from .config import settings
    db_kind = settings.database_url.split(":", 1)[0]
    try:
        with SessionLocal() as db:
            built = {r: (b.data if (b := region_blob(db, r, "build")) else None) for r in REGIONS}
        return {"status": "ok", "version": APP_VERSION, "database": db_kind, "regions_built": built}
    except Exception as e:
        return {"status": "error", "version": APP_VERSION, "database": db_kind,
                "database_url_set": bool(os.environ.get("DATABASE_URL")), "error": _clean(str(e))}


REGION_FIELDS = ("id", "name", "short", "state", "country", "coast", "center", "zoom", "bbox", "ocean_point",
                 "utilities", "disaster_authority", "surge_reference", "notes")


@router.get("/meta", tags=["meta"])
def meta():
    built: dict[str, dict | None] = {r: None for r in REGIONS}
    try:
        with SessionLocal() as db:
            for r in REGIONS:
                b = region_blob(db, r, "build")
                built[r] = b.data if b else None
    except Exception:
        pass
    return {"regions": [{**{k: R[k] for k in REGION_FIELDS}, "built": built[R["id"]],
                         "subsidence": {"hotspots": R["subsidence_hotspots"], "peak_mm_yr": R["subsidence_peak_mm_yr"],
                                        "radius_km": R["subsidence_radius_km"]}} for R in REGIONS.values()],
            "scenarios": SCENARIOS, "years": YEARS, "surge_levels": SURGE_LEVELS,
            "default": {"region": "chennai", "scenario": "ssp245", "year": 2050, "surge": DEFAULT_SURGE},
            "model": MODEL, "sources": SOURCES,
            "risk_levels": {"high": f">= {MODEL['high']}", "medium": f">= {MODEL['medium']}", "low": f"< {MODEL['medium']}"}}


@router.get("/area-impact", tags=["hazards"])
def area_impact(region: str = "chennai", scenario: Scenario = "ssp245", year: int = 2050, surge: float = DEFAULT_SURGE,
                db: Session = Depends(get_db)):
    """Which neighbourhoods and hospitals sit in flooded land, and which hospitals depend on
    high-risk substations (within the hospital radius)."""
    check_region(region), check_year(year), check_surge(surge)
    blob = region_blob(db, region, "exposure")
    if not blob:
        raise HTTPException(503, "Area data not built yet. Re-run the pipeline for this region.")
    d = blob.data
    hit = d["flooded"].get(f"{scenario}|{year}|{float(surge)}", {"hospitals": [], "places": []})
    hospitals, places = d["hospitals"], d["places"]
    flooded_h = [hospitals[i] for i in hit["hospitals"]]
    flooded_p = [places[i] for i in hit["places"]]

    rows = db.execute(select(Asset, RiskResult).join(RiskResult, RiskResult.asset_id == Asset.id).where(
        RiskResult.region == region, RiskResult.scenario == scenario, RiskResult.year == year,
        RiskResult.surge_m == surge, RiskResult.risk_level == "high", Asset.type == "substation")).all()
    radius = MODEL["hospital_radius_km"]
    from .risk.geo import haversine_km
    dependent = []
    for h in hospitals:
        near = [a.name for a, _ in rows if haversine_km(h["lat"], h["lon"], a.lat, a.lon) <= radius]
        if near:
            dependent.append({**h, "substations": near[:3]})
    return {"region": region, "scenario": scenario, "year": year, "surge": surge,
            "totals": {"hospitals": len(hospitals), "places": len(places)},
            "flooded_places": flooded_p, "flooded_hospitals": flooded_h,
            "hospitals_near_high_risk_substations": dependent}


@router.get("/assets", tags=["assets"])
def assets(region: str = "chennai", type: str | None = None, db: Session = Depends(get_db)):
    check_region(region)
    q = select(Asset).where(Asset.region == region)
    if type:
        q = q.where(Asset.type == type)
    rows = db.scalars(q).all()
    return {"type": "FeatureCollection", "features": [feature(a.lat, a.lon, asset_props(a)) for a in rows]}


@router.get("/risk", tags=["risk"])
def risk(region: str = "chennai", scenario: Scenario = "ssp245", year: int = 2050, surge: float = DEFAULT_SURGE,
         db: Session = Depends(get_db)):
    check_region(region), check_year(year), check_surge(surge)
    rows = db.execute(select(Asset, RiskResult).join(RiskResult, RiskResult.asset_id == Asset.id)
                      .where(RiskResult.region == region, RiskResult.scenario == scenario, RiskResult.year == year,
                             RiskResult.surge_m == surge)
                      .order_by(RiskResult.risk_score.desc())).all()
    counts = {"high": 0, "medium": 0, "low": 0}
    feats = []
    for a, r in rows:
        counts[r.risk_level] += 1
        feats.append(feature(a.lat, a.lon, {**asset_props(a), **risk_props(r)}))
    fz = db.scalar(select(FloodZone.area_km2).where(FloodZone.region == region, FloodZone.scenario == scenario,
                                                    FloodZone.year == year, FloodZone.surge_m == surge))
    return {"region": region, "scenario": scenario, "year": year, "surge": surge,
            "summary": {"total": len(rows), **counts, "flood_area_km2": fz,
                        "assets_flooded": sum(1 for _, r in rows if r.margin_m <= 0)},
            "type": "FeatureCollection", "features": feats}


@router.get("/assets/{asset_id}", tags=["assets"])
def asset_detail(asset_id: str, scenario: Scenario = "ssp245", surge: float = DEFAULT_SURGE, db: Session = Depends(get_db)):
    check_surge(surge)
    a = db.get(Asset, asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    rows = db.scalars(select(RiskResult).where(RiskResult.asset_id == asset_id, RiskResult.scenario == scenario,
                                               RiskResult.surge_m == surge).order_by(RiskResult.year)).all()
    return {"asset": feature(a.lat, a.lon, asset_props(a)), "scenario": scenario, "surge": surge,
            "timeline": [{"year": r.year, **risk_props(r)} for r in rows]}


@router.get("/priorities", tags=["risk"])
def priorities(region: str = "chennai", scenario: Scenario = "ssp245", year: int = 2050,
               surge: float = DEFAULT_SURGE, limit: int = Query(10, ge=1, le=200), type: str | None = None,
               db: Session = Depends(get_db)):
    check_region(region), check_year(year), check_surge(surge)
    q = (select(Asset, RiskResult).join(RiskResult, RiskResult.asset_id == Asset.id)
         .where(RiskResult.region == region, RiskResult.scenario == scenario, RiskResult.year == year,
                RiskResult.surge_m == surge))
    if type:
        q = q.where(Asset.type == type)
    rows = db.execute(q.order_by(RiskResult.risk_score.desc()).limit(limit)).all()
    return {"region": region, "scenario": scenario, "year": year, "surge": surge,
            "items": [{"rank": i, "id": a.id, "name": a.name, "type": a.type, "voltage_kv": a.voltage_kv,
                       "lat": a.lat, "lon": a.lon, **risk_props(r)} for i, (a, r) in enumerate(rows, 1)]}


@router.get("/sea-level", tags=["hazards"])
def sea_level(region: str = "chennai", db: Session = Depends(get_db)):
    check_region(region)
    rows = db.scalars(select(SeaLevel).where(SeaLevel.region == region).order_by(SeaLevel.year)).all()
    out = {sc: [] for sc in SCENARIO_IDS}
    for r in rows:
        out[r.scenario].append({"year": r.year, "p17": r.p17, "p50": r.p50, "p83": r.p83})
    return {"region": region, "unit": "m", "baseline": "1995-2014", "source": rows[0].source if rows else None,
            "series": out}


@router.get("/flood-zones", tags=["hazards"])
def flood_zones(region: str = "chennai", scenario: Scenario = "ssp245", year: int = 2050, surge: float = DEFAULT_SURGE,
                db: Session = Depends(get_db)):
    check_region(region), check_year(year), check_surge(surge)
    z = db.scalar(select(FloodZone).where(FloodZone.region == region, FloodZone.scenario == scenario,
                                          FloodZone.year == year, FloodZone.surge_m == surge))
    if not z:
        raise HTTPException(503, "Region data not built yet")
    return {"type": "FeatureCollection", "features": [{
        "type": "Feature", "geometry": json.loads(z.geojson),
        "properties": {"scenario": scenario, "year": year, "surge": surge, "area_km2": z.area_km2}}]}


@router.get("/safe-sites", tags=["hazards"])
def safe_sites(region: str = "chennai", scenario: Scenario = "ssp245", db: Session = Depends(get_db)):
    check_region(region)
    rows = db.scalars(select(SafeSite).where(SafeSite.region == region, SafeSite.scenario == scenario)
                      .order_by(SafeSite.rank)).all()
    return {"type": "FeatureCollection", "features": [feature(s.lat, s.lon, {
        "rank": s.rank, "ground_elev_m": s.ground_elev_m, "margin_2100_m": s.margin_2100_m,
        "dist_coast_km": s.dist_coast_km, "nearest_substation_km": s.nearest_substation_km, "score": s.score})
        for s in rows]}


@router.get("/ocean", tags=["hazards"])
def ocean(region: str = "chennai", db: Session = Depends(get_db)):
    check_region(region)
    b = region_blob(db, region, "ocean")
    if not b:
        raise HTTPException(503, "Region data not built yet")
    return {"region": region, "updated_at": b.updated_at, **b.data}


@router.get("/coastline", tags=["hazards"])
def coastline(region: str = "chennai", db: Session = Depends(get_db)):
    check_region(region)
    b = region_blob(db, region, "coastline")
    lines = b.data["lines"] if b else []
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "LineString", "coordinates": l}, "properties": {}} for l in lines]}


class SimulateIn(BaseModel):
    asset_id: str
    scenario: Scenario = "ssp245"
    year: int = 2050
    raise_m: float = Field(1.0, ge=0, le=10, description="How much to raise the equipment base (m)")
    surge: float = Field(DEFAULT_SURGE, ge=0, le=5, description="Tide + storm-surge allowance (m)")


@router.post("/simulate", tags=["risk"])
def simulate(body: SimulateIn, db: Session = Depends(get_db)):
    check_year(body.year)
    a = db.get(Asset, body.asset_id)
    if not a:
        raise HTTPException(404, "Asset not found")
    curve, climate = curve_for(db, a.region, body.scenario), climate_for(db, a.region)
    base = E.AssetInput(a.id, a.base_elev_m, a.dist_coast_km, a.criticality, a.subsidence_mm_yr)
    raised = E.AssetInput(a.id, a.base_elev_m + body.raise_m, a.dist_coast_km, a.criticality, a.subsidence_mm_yr)
    before = E.assess(base, curve, body.year, climate, body.surge).dict()
    after = E.assess(raised, curve, body.year, climate, body.surge).dict()
    gained = None
    if before["flood_year"] is not None:
        gained = (after["flood_year"] - before["flood_year"]) if after["flood_year"] else "beyond 2150"
    return {"asset_id": a.id, "name": a.name, "scenario": body.scenario, "year": body.year, "surge": body.surge,
            "raise_m": body.raise_m,
            "before": before, "after": after, "years_gained": gained,
            "risk_reduction": round(before["risk_score"] - after["risk_score"], 3)}
