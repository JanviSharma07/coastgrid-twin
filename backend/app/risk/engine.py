"""CoastGrid Twin risk engine: pure functions, no database or network.

For each asset and (scenario, year):
  water level   = sea-level rise (AR6) + land sinking since 2020 + extreme-water allowance
  flood margin  = asset base elevation - water level
  flood score   = 1 when water reaches the base, falling to 0 at a 2 m margin
  heat score    = coastal influence x ocean/climate stress (marine heatwaves, humidity)
  salt score    = coastal influence (short range) x share of onshore (sea) winds
  risk          = (0.6 flood + 0.2 heat + 0.2 salt) x (0.6 + 0.4 criticality)
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict

from ..config import MODEL, FLOOD_YEAR_SEARCH
from .sealevel import SeaLevelCurve

SUBSIDENCE_START_YEAR = 2020


@dataclass
class AssetInput:
    id: str
    base_elev_m: float
    dist_coast_km: float
    criticality: float
    subsidence_mm_yr: float = 0.0


@dataclass
class Climate:
    """Region-level ocean and weather conditions (from the pipeline)."""
    mhw_days_last_year: float = 0.0     # NOAA CRW days in a marine heatwave
    rh_mean: float = 70.0               # % mean relative humidity (ERA5)
    onshore_fraction: float = 0.5       # share of hours with wind from the sea (ERA5)

    @property
    def climate_factor(self) -> float:
        mhw = min(self.mhw_days_last_year / 90.0, 1.0)
        humid = min(max((self.rh_mean - 60.0) / 30.0, 0.0), 1.0)
        return 0.5 * mhw + 0.5 * humid


@dataclass
class RiskOut:
    water_level_m: float
    margin_m: float
    flood_score: float
    heat_score: float
    salt_score: float
    risk_score: float
    risk_level: str
    flood_year: int | None
    main_threat: str
    action: str

    def dict(self) -> dict:
        return asdict(self)


def clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


def water_level(curve: SeaLevelCurve, year: float, subsidence_mm_yr: float,
                allowance_m: float, pct: str = "p50") -> float:
    sink = max(0.0, year - SUBSIDENCE_START_YEAR) * subsidence_mm_yr / 1000.0
    return curve.at(year, pct) + sink + allowance_m


def flood_year(curve: SeaLevelCurve, a: AssetInput, allowance_m: float, pct: str = "p50") -> int | None:
    start, end = FLOOD_YEAR_SEARCH
    for yr in range(start, end + 1):
        if water_level(curve, yr, a.subsidence_mm_yr, allowance_m, pct) >= a.base_elev_m:
            return yr
    return None


def heat_score(dist_km: float, climate: Climate) -> float:
    coastal = math.exp(-max(dist_km, 0.0) / MODEL["heat_decay_km"])
    return clip01(coastal * (0.5 + 0.5 * climate.climate_factor))


def salt_score(dist_km: float, climate: Climate) -> float:
    coastal = math.exp(-max(dist_km, 0.0) / MODEL["salt_decay_km"])
    return clip01(coastal * (0.4 + 0.6 * climate.onshore_fraction))


def level_of(score: float) -> str:
    if score >= MODEL["high"]:
        return "high"
    if score >= MODEL["medium"]:
        return "medium"
    return "low"


def recommend(level: str, threat: str, fy: int | None, year: int, margin: float) -> str:
    if level == "low":
        return "Monitor; review every 5 years"
    if threat == "flooding":
        if fy is not None and fy <= max(year, 2050):
            return "Raise plinth or relocate before " + str(fy)
        if margin < 1.0:
            return "Flood wall, waterproofing and pumps"
        return "Plan elevation in next upgrade cycle"
    if threat == "salt":
        return "Salt-resistant (polymer) insulators and regular washing"
    return "Cooling upgrade and transformer load management"


def assess(a: AssetInput, curve: SeaLevelCurve, year: int, climate: Climate,
           allowance_m: float | None = None, pct: str = "p50") -> RiskOut:
    allowance = MODEL["extreme_water_allowance_m"] if allowance_m is None else allowance_m
    wl = water_level(curve, year, a.subsidence_mm_yr, allowance, pct)
    margin = a.base_elev_m - wl
    f = clip01(1.0 - margin / MODEL["flood_margin_scale_m"])
    h = heat_score(a.dist_coast_km, climate)
    s = salt_score(a.dist_coast_km, climate)
    hazard = MODEL["w_flood"] * f + MODEL["w_heat"] * h + MODEL["w_salt"] * s
    risk = hazard * (MODEL["crit_floor"] + (1 - MODEL["crit_floor"]) * clip01(a.criticality))
    parts = {"flooding": MODEL["w_flood"] * f, "heat": MODEL["w_heat"] * h, "salt": MODEL["w_salt"] * s}
    threat = max(parts, key=parts.get)
    fy = flood_year(curve, a, allowance, pct)
    lvl = level_of(risk)
    return RiskOut(
        water_level_m=round(wl, 3), margin_m=round(margin, 3),
        flood_score=round(f, 3), heat_score=round(h, 3), salt_score=round(s, 3),
        risk_score=round(risk, 3), risk_level=lvl, flood_year=fy,
        main_threat=threat, action=recommend(lvl, threat, fy, year, margin),
    )


def criticality(voltage_kv: float | None, hospitals_nearby: int, asset_type: str) -> float:
    """0-1: higher voltage and more hospitals nearby = more people depend on the asset."""
    if asset_type == "power_plant":
        base = 1.0
    elif voltage_kv is None:
        base = 0.4
    elif voltage_kv >= 220:
        base = 1.0
    elif voltage_kv >= 110:
        base = 0.8
    elif voltage_kv >= 33:
        base = 0.6
    else:
        base = 0.4
    return round(clip01(base * 0.8 + 0.2 * min(hospitals_nearby, 5) / 5), 3)


def subsidence_rate(lat: float, lon: float, hotspots: list[dict], peak: float, radius_km: float) -> float:
    from .geo import haversine_km
    best = 0.0
    for h in hotspots:
        d = haversine_km(lat, lon, h["lat"], h["lon"])
        if d < radius_km:
            best = max(best, peak * (1 - d / radius_km))
    return round(best, 2)
