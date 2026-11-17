"""Central configuration: settings from environment, region definitions and model parameters.

Every number the risk model uses lives here, with a note on where it comes from,
so the methodology can be explained (and changed) in one place.
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"  # cached API responses (git-ignored)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # SQLite by default for local work; set DATABASE_URL to the Supabase Postgres URL in .env
    database_url: str = f"sqlite:///{(BASE_DIR / 'coastgrid.db').as_posix()}"
    # Comma-separated list of frontend origins allowed to call the API ("*" = any)
    cors_origins: str = "*"
    # Contact string sent to public APIs (OpenStreetMap asks clients to identify themselves)
    user_agent: str = "CoastGridTwin/1.0 (github.com/JanviSharma07/coastgrid-twin)"


settings = Settings()

APP_VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Regions
# ---------------------------------------------------------------------------
REGIONS: dict[str, dict] = {
    "chennai": {
        "id": "chennai",
        "name": "Chennai, Tamil Nadu",
        "country": "India",
        "center": [13.05, 80.24],
        "zoom": 11,
        # south, west, north, east
        "bbox": [12.85, 80.10, 13.25, 80.36],
        # Direction (degrees, meteorological "from") the sea lies in. Chennai faces east.
        "sea_bearing_deg": 90,
        # Point just offshore used for ocean-heat data
        "ocean_point": [13.05, 80.36],
        # UTM zone for metre-accurate distances (EPSG:32644 = WGS84 / UTM 44N)
        "utm_epsg": 32644,
        # Elevation grid spacing in degrees (~650 m)
        "grid_step_deg": 0.006,
        # Land-subsidence hotspots reported for Chennai (Nature Sustainability, 2025):
        # Adyar flood plains, Valasaravakkam, Kodambakkam, Alandur, Tondiarpet.
        # Coordinates are approximate locality centres. Rate tapers from the published
        # peak (31.7 mm/yr) at the centre to 0 at the radius. Replace with NISAR / Sentinel-1
        # InSAR rates when processed.
        "subsidence_peak_mm_yr": 31.7,
        "subsidence_radius_km": 1.5,
        "subsidence_hotspots": [
            {"name": "Adyar flood plains", "lat": 13.010, "lon": 80.245},
            {"name": "Valasaravakkam", "lat": 13.040, "lon": 80.172},
            {"name": "Kodambakkam", "lat": 13.052, "lon": 80.225},
            {"name": "Alandur", "lat": 13.000, "lon": 80.205},
            {"name": "Tondiarpet", "lat": 13.128, "lon": 80.288},
        ],
    }
}

# ---------------------------------------------------------------------------
# Scenarios and years
# ---------------------------------------------------------------------------
SCENARIOS = [
    {"id": "ssp126", "label": "SSP1-2.6 (Low emissions)"},
    {"id": "ssp245", "label": "SSP2-4.5 (Intermediate)"},
    {"id": "ssp585", "label": "SSP5-8.5 (High emissions)"},
]
SCENARIO_IDS = [s["id"] for s in SCENARIOS]
YEARS = [2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100]
FLOOD_YEAR_SEARCH = (2025, 2150)  # flood year is reported as "beyond 2150" if not reached

# ---------------------------------------------------------------------------
# Risk model parameters (see docs/METHODOLOGY.md)
# ---------------------------------------------------------------------------
MODEL = {
    # Extra water on top of mean sea level during an extreme event (tide + storm surge).
    # Assumption, adjustable per request. Should be set from INCOIS storm-surge guidance.
    "extreme_water_allowance_m": 1.0,
    # Height of equipment base above surrounding ground when not known (plinth). Assumption.
    "default_plinth_m": 0.3,
    # Flood score falls linearly from 1 (water at/above base) to 0 at this margin (m).
    "flood_margin_scale_m": 2.0,
    # Decay lengths for coastal influence (km)
    "heat_decay_km": 10.0,
    "salt_decay_km": 3.0,
    # Hazard weights
    "w_flood": 0.6,
    "w_heat": 0.2,
    "w_salt": 0.2,
    # Risk = hazard * (crit_floor + (1 - crit_floor) * criticality)
    "crit_floor": 0.6,
    "hospital_radius_km": 3.0,
    # Risk level thresholds
    "high": 0.55,
    "medium": 0.30,
    # Safe sites for new solar + battery
    "safe_min_margin_m": 2.0,   # ground must stay this far above the worst-case 2100 water level
    "safe_min_coast_km": 2.0,
    "safe_max_substation_km": 4.0,
    "safe_max_sites": 10,
    "safe_min_spacing_km": 1.0,
}

# Data provenance shown in the app (About / methodology page)
SOURCES = [
    {"layer": "Power assets, hospitals, coastline", "name": "OpenStreetMap (Overpass API)",
     "url": "https://www.openstreetmap.org/copyright", "licence": "ODbL"},
    {"layer": "Ground elevation", "name": "Copernicus DEM GLO-90 via Open-Meteo Elevation API",
     "url": "https://open-meteo.com/en/docs/elevation-api", "licence": "Copernicus DEM licence / CC BY 4.0"},
    {"layer": "Sea-level rise projections", "name": "IPCC AR6 sea-level projections (NASA Sea Level Projection Tool)",
     "url": "https://sealevel.nasa.gov/data_tools/17", "licence": "Public"},
    {"layer": "Land subsidence", "name": "Nature Sustainability (2025) Chennai hotspots; NISAR / Sentinel-1 planned",
     "url": "https://asf.alaska.edu/notices/nisar-l-band-data-now-publicly-available/", "licence": "Public"},
    {"layer": "Marine heatwaves", "name": "NOAA Coral Reef Watch Marine Heatwave Watch (5 km)",
     "url": "https://coralreefwatch.noaa.gov/product/marine_heatwave/", "licence": "Public domain"},
    {"layer": "Sea surface temperature", "name": "Open-Meteo Marine API",
     "url": "https://open-meteo.com/en/docs/marine-weather-api", "licence": "CC BY 4.0"},
    {"layer": "Wind, humidity, temperature", "name": "ERA5 reanalysis via Open-Meteo Historical API",
     "url": "https://open-meteo.com/en/docs/historical-weather-api", "licence": "CC BY 4.0"},
    {"layer": "Coastal vulnerability (reference)", "name": "INCOIS Coastal Vulnerability Index",
     "url": "https://incois.gov.in/documents/ITCOocean/Coastal_Vulnerability_Mapping.pdf", "licence": "Reference"},
]
