"""End-to-end tests on synthetic data: pipeline -> database -> API."""
from __future__ import annotations

import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.pipeline import build as B  # noqa: E402
from app.pipeline import sources as S  # noqa: E402
from app.risk import engine as E  # noqa: E402
from app.risk.sealevel import SeaLevelCurve, build_table  # noqa: E402
from tests import synthetic  # noqa: E402


@pytest.fixture(scope="session")
def client():
    synthetic.patch(S)
    summary = B.build("chennai")
    assert summary["assets"] > 30
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_sea_level_monotonic():
    rows = build_table()
    for sc in ("ssp126", "ssp245", "ssp585"):
        c = SeaLevelCurve(rows, sc)
        vals = [c.at(y) for y in range(2020, 2151, 5)]
        assert all(b >= a for a, b in zip(vals, vals[1:]))
        assert abs(c.at(2100) - {"ssp126": 0.44, "ssp245": 0.56, "ssp585": 0.77}[sc]) < 0.01
    assert SeaLevelCurve(rows, "ssp585").at(2100) > SeaLevelCurve(rows, "ssp126").at(2100)


def test_engine_low_vs_high_asset():
    rows = build_table()
    c = SeaLevelCurve(rows, "ssp245")
    clim = E.Climate(40, 75, 0.5)
    low = E.assess(E.AssetInput("a", 1.0, 0.3, 1.0), c, 2050, clim)
    high = E.assess(E.AssetInput("b", 25.0, 20.0, 0.4), c, 2050, clim)
    assert low.risk_score > high.risk_score
    assert low.risk_level == "high" and high.risk_level == "low"
    assert low.flood_year is not None and high.flood_year is None
    assert low.main_threat == "flooding"


def test_voltage_parse():
    assert B.parse_voltage("230000;110000") == 230
    assert B.parse_voltage(None) is None
    assert B.parse_voltage("abc") is None


def test_health_and_meta(client):
    assert client.get("/api/health").json()["status"] == "ok"
    m = client.get("/api/meta").json()
    assert m["years"][0] == 2030 and len(m["scenarios"]) == 3


def test_risk_and_priorities(client):
    r = client.get("/api/risk", params={"scenario": "ssp585", "year": 2100}).json()
    s = r["summary"]
    assert s["total"] == s["high"] + s["medium"] + s["low"] > 0
    scores = [f["properties"]["risk_score"] for f in r["features"]]
    assert scores == sorted(scores, reverse=True)
    p = client.get("/api/priorities", params={"limit": 5}).json()["items"]
    assert len(p) == 5 and p[0]["rank"] == 1
    # risk never decreases with time for the same asset
    a0 = client.get(f"/api/assets/{p[0]['id']}").json()["timeline"]
    assert all(b["risk_score"] >= a["risk_score"] - 1e-9 for a, b in zip(a0, a0[1:]))


def test_flood_zones_grow(client):
    a = client.get("/api/flood-zones", params={"scenario": "ssp585", "year": 2030}).json()
    b = client.get("/api/flood-zones", params={"scenario": "ssp585", "year": 2100}).json()
    assert b["features"][0]["properties"]["area_km2"] >= a["features"][0]["properties"]["area_km2"] > 0


def test_simulate_raising_helps(client):
    top = client.get("/api/priorities", params={"limit": 1, "scenario": "ssp585", "year": 2100}).json()["items"][0]
    r = client.post("/api/simulate", json={"asset_id": top["id"], "scenario": "ssp585", "year": 2100, "raise_m": 2}).json()
    assert r["after"]["risk_score"] <= r["before"]["risk_score"]
    assert r["after"]["margin_m"] == pytest.approx(r["before"]["margin_m"] + 2, abs=1e-6)


def test_other_endpoints(client):
    assert client.get("/api/safe-sites").json()["features"]
    assert client.get("/api/sea-level").json()["series"]["ssp245"]
    assert client.get("/api/ocean").json()["available"]["mhw"] is True
    assert client.get("/api/coastline").json()["features"]
    assert client.get("/api/assets", params={"type": "solar"}).json()["features"]
    assert client.get("/api/risk", params={"year": 2033}).status_code == 422
    assert client.get("/api/assets/nope").status_code == 404
