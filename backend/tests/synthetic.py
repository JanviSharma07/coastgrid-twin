"""Synthetic stand-ins for the network fetchers, so the pipeline and API can be tested offline.

The terrain is a simple east-facing coast near Chennai's longitude, rising inland,
with two low river channels. None of these values are real data.
"""
from __future__ import annotations

import math
import random

COAST_LON = 80.29


def coast_lon(lat: float) -> float:
    return COAST_LON + 0.01 * math.sin(lat * 40)


def fake_elev(lat: float, lon: float) -> float:
    c = coast_lon(lat)
    if lon > c:
        return 0.0
    d_km = (c - lon) * 108.0
    z = 1.2 + 0.9 * d_km
    for rlat in (13.07, 13.01):  # two river channels running inland
        z -= 3.0 * math.exp(-((lat - rlat) / 0.006) ** 2)
    return round(max(z, 0.3), 2)


def patch(sources_module) -> None:
    rnd = random.Random(42)

    def coastline(bbox, cache):
        s, _, n, _ = bbox
        lats = [s - 0.1 + i * 0.01 for i in range(int((n - s + 0.2) / 0.01) + 1)]
        return [[[coast_lon(la), la] for la in lats]]

    def power(bbox, cache):
        s, w, n, e = bbox
        els = []
        for i in range(40):
            la = rnd.uniform(s + 0.02, n - 0.02)
            lo = rnd.uniform(w + 0.02, coast_lon(la) - 0.004)
            kv = rnd.choice(["230000;110000", "110000;33000", "33000;11000", None])
            tags = {"power": "substation"}
            if kv:
                tags["voltage"] = kv
            if i % 3 == 0:
                tags["name"] = f"Test Substation {i}"
            els.append({"type": "node", "id": 1000 + i, "lat": la, "lon": lo, "tags": tags})
        els.append({"type": "way", "id": 9001, "center": {"lat": 13.16, "lon": 80.27},
                    "tags": {"power": "plant", "name": "Test Thermal Plant", "plant:source": "coal"}})
        els.append({"type": "way", "id": 9002, "center": {"lat": 12.95, "lon": 80.15},
                    "tags": {"power": "plant", "name": "Test Solar Park", "plant:source": "solar"}})
        # 6 panel rows of one rooftop installation (OSM style) -> should merge into one asset
        for k in range(6):
            els.append({"type": "way", "id": 9100 + k, "center": {"lat": 13.0697 + k * 0.00003, "lon": 80.2700},
                        "tags": {"power": "generator", "generator:source": "solar"}})
        return els

    def hospitals(bbox, cache):
        s, w, n, e = bbox
        return [{"type": "node", "id": i, "lat": rnd.uniform(s, n), "lon": rnd.uniform(w, 80.27)} for i in range(25)]

    def elevations(points, cache, label):
        return [fake_elev(la, lo) for la, lo in points]

    sources_module.fetch_coastline = coastline
    sources_module.fetch_power_assets = power
    sources_module.fetch_hospitals = hospitals
    def dem(bbox, cache):
        import numpy as np
        from affine import Affine
        s, w, n, e = bbox
        res = 1 / 600  # coarser than real 30 m, to keep tests fast
        ny, nx = int(round((n - s) / res)), int(round((e - w) / res))
        lats = n - (np.arange(ny) + 0.5) * res
        lons = w + (np.arange(nx) + 0.5) * res
        arr = np.array([[fake_elev(float(la), float(lo)) for lo in lons] for la in lats], dtype="float32")
        return arr, Affine(res, 0, w, 0, -res, n)

    sources_module.fetch_elevations = elevations
    sources_module.fetch_dem = dem
    sources_module.fetch_marine_sst = lambda *a: {"sst_latest_c": 29.1, "sst_mean_92d_c": 29.4, "sst_max_92d_c": 30.6}
    sources_module.fetch_mhw = lambda *a: {"mhw_days_last_year": 41, "mhw_category_latest": 0, "mhw_max_category": 2,
                                           "mhw_latest_date": "2026-11-15", "pixel_lon": 80.36}
    sources_module.fetch_era5_climate = lambda *a: {"year": 2025, "onshore_fraction": 0.52, "rh_mean": 74.3,
                                                    "t_mean_c": 29.0, "t_p95_c": 36.2}
