# CoastGrid Twin

**A digital twin for climate-resilient coastal power grids.**
Team TwinVolt — Electroblitz Ideathon 2026 (Decentralized & Resilient Power Systems).

Coastal substations are threatened by rising seas, sinking land, ocean heat and salt-laden sea air, and
utilities usually act only after a flood. CoastGrid Twin combines these threats for every power asset
and answers: **which assets fail, when, why, and what to fix first.**

## What it does

- **Asset map:** substations, power plants, solar and battery sites (OpenStreetMap)
- **Flood timeline:** the year water reaches each asset's base under three IPCC AR6 emission scenarios
- **Heat and salt stress:** from NOAA marine heatwave data, ERA5 wind and humidity, and distance to coast
- **Risk score (0–1):** weighted by criticality (voltage, hospitals served)
- **Priority action list:** raise, relocate, waterproof, salt-resistant insulators, cooling
- **What-if simulator:** raise an asset and see the years of protection gained
- **Safe-site finder:** high ground near the grid for new solar + battery microgrids

## Architecture

```
Open data (NASA/IPCC AR6, Copernicus DEM, NOAA CRW, ERA5, OpenStreetMap)
        │  backend/app/pipeline   (Python: fetch, clean, cache)
        ▼
PostgreSQL (Supabase) / SQLite   ← assets, risk results, flood zones, safe sites
        │  backend/app/risk       (risk engine: flood, heat, salt, criticality)
        ▼
FastAPI REST API  (backend/app/api.py, docs at /docs) — hosted on Vercel, auto-deploys on push
        ▼
React + Leaflet dashboard  (frontend/)
```

## Run the backend (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # optional: add your Supabase DATABASE_URL
python -m app.pipeline.build --region chennai   # downloads data and builds the twin (~10 min first time)
uvicorn app.main:app --reload   # open http://127.0.0.1:8000/docs
python -m pytest -q             # tests (offline, synthetic data)
```

## Docs

- [API reference](docs/API.md)
- [Methodology and limitations](docs/METHODOLOGY.md)
- Sample API responses for UI work: `frontend/public/mock/`

## Data sources

OpenStreetMap (ODbL) · Copernicus DEM via Open-Meteo · IPCC AR6 sea-level projections (NASA Sea Level
Projection Tool) · NOAA Coral Reef Watch · ERA5 via Open-Meteo · Nature Sustainability (2025) subsidence
study · INCOIS Coastal Vulnerability Index (reference).

## Team TwinVolt

Janvi Sharma · Khushi Kumari — Dayananda Sagar University
