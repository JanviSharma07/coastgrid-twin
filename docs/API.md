# CoastGrid Twin API

Base URL: `http://127.0.0.1:8000` locally, or the deployed URL (set as `VITE_API_URL` in the frontend).
Interactive docs: `<base>/docs`.

All responses are JSON. Map data is **GeoJSON** (`[longitude, latitude]` order). Every endpoint has a
sample response in `frontend/public/mock/` (synthetic test data with the same shape, default surge 1.5).

Common query parameters:

| Param | Values | Default |
|---|---|---|
| `region` | `chennai` | `chennai` |
| `scenario` | `ssp126` (low), `ssp245` (intermediate), `ssp585` (high emissions) | `ssp245` |
| `year` | `2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100` | `2050` |
| `surge` | Storm surge + tide on top of sea level, metres: `0.5` (high tide), `1.0`, `1.5` (Cyclone Vardah-like), `2.0` | `1.5` |

## Endpoints

| Method | Path | What it returns | Mock file |
|---|---|---|---|
| GET | `/api/health` | Status and when each region was last built | `health.json` |
| GET | `/api/meta` | Regions (centre, zoom, bbox), scenarios, years, defaults, model parameters, data sources | `meta.json` |
| GET | `/api/risk?region&scenario&year&surge` | Summary counts + GeoJSON of every asset with its risk (sorted, highest first) | `risk_<scenario>_<year>.json` |
| GET | `/api/priorities?region&scenario&year&surge&limit=10&type=` | Ranked action list | `priorities_<scenario>_<year>.json` |
| GET | `/api/assets?region&type=` | GeoJSON of assets (no risk) | `assets.json` |
| GET | `/api/assets/{id}?scenario&surge` | One asset + risk timeline 2030–2100 | `asset_detail.json` |
| GET | `/api/flood-zones?region&scenario&year&surge` | GeoJSON (Multi)Polygon of land flooded in an extreme event | `flood-zones_<scenario>_<year>.json` |
| GET | `/api/safe-sites?region&scenario` | Top 10 safe sites for new solar + battery | `safe-sites_<scenario>.json` |
| GET | `/api/sea-level?region` | Sea-level rise by year for all scenarios (median + likely range) | `sea-level.json` |
| GET | `/api/ocean?region` | Sea temperature, marine heatwave days, onshore wind share, humidity | `ocean.json` |
| GET | `/api/coastline?region` | Coastline GeoJSON | `coastline.json` |
| POST | `/api/simulate` | What-if: raise an asset's base and compare risk before/after | `simulate.json` |

### `/api/risk` — feature properties

| Field | Meaning |
|---|---|
| `id`, `name`, `type` | `type` is `substation`, `power_plant`, `solar` or `battery` |
| `voltage_kv`, `operator` | From OpenStreetMap (may be `null`) |
| `ground_elev_m`, `base_elev_m` | Ground height and equipment base height (m above sea level) |
| `dist_coast_km` | Distance to the coastline |
| `hospitals_nearby` | Hospitals within 3 km |
| `criticality` | 0–1, from voltage and hospitals served |
| `subsidence_mm_yr` | Land sinking rate used |
| `risk_score` | 0–1 |
| `risk_level` | `high` (≥ 0.55), `medium` (≥ 0.30), `low` |
| `flood_score`, `heat_score`, `salt_score` | 0–1 components |
| `water_level_m` | Extreme water level in that year (sea-level rise + land sinking + surge) |
| `margin_m` | `base_elev_m - water_level_m` (negative = under water) |
| `flood_year` | First year water reaches the base (`null` = not before 2150) |
| `main_threat` | `flooding`, `heat` or `salt` |
| `action` | Recommended action text |

`summary`: `{ total, high, medium, low, flood_area_km2, assets_flooded }`

### `POST /api/simulate`

Request:
```json
{ "asset_id": "osm-node-123", "scenario": "ssp245", "year": 2050, "raise_m": 1.5, "surge": 1.5 }
```
Response: `before` and `after` (same fields as risk), `years_gained` (number, `"beyond 2150"` or `null`),
`risk_reduction`.

### Errors

`404` unknown asset/region, `422` invalid parameter (for example a year not in the list),
`503` region data not built yet. Body: `{ "detail": "message" }`.

## GET /api/area-impact

Neighbourhoods and hospitals affected for one future.

Params: `region` (chennai | mumbai | kochi), `scenario`, `year`, `surge`.

Returns `totals` {hospitals, places}, `flooded_places` [{name, lat, lon, kind}],
`flooded_hospitals` [{name, lat, lon}], and `hospitals_near_high_risk_substations`
[{name, lat, lon, substations[]}] (within 3 km of a substation at high risk).
A point counts as flooded when its ~150 m grid cell is under sea water.
Returns 503 until the pipeline has been run for the region with this version.

## Regions

`/api/meta` lists Chennai, Mumbai and Kochi with `built` (null until the pipeline has run),
utilities, disaster authority and calibration `notes`.
