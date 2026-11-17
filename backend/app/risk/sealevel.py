"""Sea-level rise projections and interpolation.

Values are metres of rise relative to the IPCC AR6 baseline (1995-2014, centred on 2005).
p17 / p50 / p83 = the AR6 "likely range" (17th-83rd percentile) and median.

Default values below are the IPCC AR6 WG1 *global mean* projections (SPM / Table 9.9).
Replace them with location-specific values for each region using the NASA Sea Level
Projection Tool export: put a CSV at data/sealevel/<region>.csv with columns
scenario,year,p17,p50,p83 and re-run the pipeline.
"""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

BASELINE_YEAR = 2005

AR6_GLOBAL = {
    # scenario: {year: (p17, p50, p83)}
    "ssp126": {2050: (0.16, 0.19, 0.25), 2100: (0.32, 0.44, 0.62), 2150: (0.46, 0.68, 0.99)},
    "ssp245": {2050: (0.17, 0.20, 0.26), 2100: (0.44, 0.56, 0.76), 2150: (0.66, 0.92, 1.33)},
    "ssp585": {2050: (0.20, 0.23, 0.29), 2100: (0.63, 0.77, 1.01), 2150: (0.98, 1.32, 1.88)},
}
AR6_GLOBAL_SOURCE = "IPCC AR6 WG1 global mean projections (interim; replace with NASA tool values for the region)"


def _curve(anchors: dict[int, float]) -> callable:
    """Smooth curve through (2005, 0) and the anchor years.

    Quadratic through 2005/2050/2100 (sea-level rise is accelerating), linear after 2100.
    """
    ys = sorted(anchors)
    x = np.array([BASELINE_YEAR, ys[0], ys[1]], dtype=float)
    y = np.array([0.0, anchors[ys[0]], anchors[ys[1]]])
    coef = np.polyfit(x, y, 2)

    def f(year: float) -> float:
        if year <= ys[1]:
            return float(max(0.0, np.polyval(coef, year)))
        if len(ys) > 2:
            y1, y2 = anchors[ys[1]], anchors[ys[2]]
            return float(y1 + (y2 - y1) * (year - ys[1]) / (ys[2] - ys[1]))
        slope = 2 * coef[0] * ys[1] + coef[1]
        return float(anchors[ys[1]] + slope * (year - ys[1]))

    return f


def build_table(anchor_table: dict = AR6_GLOBAL, years=range(2020, 2151, 10)) -> list[dict]:
    rows = []
    for scen, by_year in anchor_table.items():
        fs = [_curve({y: v[k] for y, v in by_year.items()}) for k in range(3)]
        for yr in years:
            p17, p50, p83 = (round(f(yr), 3) for f in fs)
            rows.append({"scenario": scen, "year": yr, "p17": p17, "p50": p50, "p83": p83})
    return rows


def load_region_csv(path: Path) -> list[dict] | None:
    """Read a region-specific table (scenario,year,p17,p50,p83) if present."""
    if not path.exists():
        return None
    with path.open(newline="", encoding="utf-8") as fh:
        return [{"scenario": r["scenario"].strip().lower(), "year": int(r["year"]),
                 "p17": float(r["p17"]), "p50": float(r["p50"]), "p83": float(r["p83"])}
                for r in csv.DictReader(fh)]


class SeaLevelCurve:
    """Interpolates a scenario's table to any year."""

    def __init__(self, rows: list[dict], scenario: str):
        pts = sorted((r["year"], r) for r in rows if r["scenario"] == scenario)
        if not pts:
            raise ValueError(f"No sea-level data for scenario {scenario}")
        self.years = np.array([BASELINE_YEAR] + [p[0] for p in pts], dtype=float)
        self.vals = {k: np.array([0.0] + [p[1][k] for p in pts]) for k in ("p17", "p50", "p83")}

    def at(self, year: float, pct: str = "p50") -> float:
        y, v = self.years, self.vals[pct]
        if year > y[-1]:  # extrapolate with the last segment's slope
            slope = (v[-1] - v[-2]) / (y[-1] - y[-2])
            return float(v[-1] + slope * (year - y[-1]))
        return float(np.interp(year, y, v))
