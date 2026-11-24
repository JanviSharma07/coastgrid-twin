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
        "short": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "coast": "Bay of Bengal (east coast)",
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
        # Fallback elevation grid spacing in degrees (~650 m), used only if the 30 m DEM is unavailable
        "grid_step_deg": 0.006,
        # The 30 m DEM is aggregated by this factor for flood modelling (5 x 30 m = ~150 m cells)
        "dem_block": 5,
        # Land-subsidence hotspots reported for Chennai (Sadhasivam et al., Nature Sustainability, Oct 2025):
        # Adyar flood plains, Valasaravakkam, Kodambakkam, Alandur, Tondiarpet, K K Nagar.
        # Coordinates are approximate locality centres. Rate tapers from the published city
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
            {"name": "K K Nagar", "lat": 13.040, "lon": 80.199},
        ],
        "utilities": "TNPDCL / TANGEDCO (distribution), TANTRANSCO (transmission)",
        "disaster_authority": "Tamil Nadu State Disaster Management Authority",
        "surge_reference": "IMD report on Cyclone Vardah (Dec 2016): about 1 m surge on a 0.47 m tide.",
        "notes": [],
    },
    "mumbai": {
        "id": "mumbai",
        "name": "Mumbai, Maharashtra",
        "short": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "coast": "Arabian Sea (west coast)",
        "center": [19.07, 72.88],
        "zoom": 11,
        "bbox": [18.89, 72.77, 19.27, 72.99],
        "sea_bearing_deg": 270,
        "ocean_point": [19.05, 72.75],
        "utm_epsg": 32643,
        "grid_step_deg": 0.006,
        "dem_block": 5,
        # The same study reports a Mumbai peak of 26.1 mm/yr but no locality points we can cite,
        # so no hotspots are modelled until InSAR rates are processed.
        "subsidence_peak_mm_yr": 26.1,
        "subsidence_radius_km": 1.5,
        "subsidence_hotspots": [],
        "utilities": "BEST, Adani Electricity Mumbai, Tata Power (distribution), MSETCL (transmission)",
        "disaster_authority": "Maharashtra State Disaster Management Authority / BMC disaster cell",
        "surge_reference": "Storm levels use the same test values as Chennai; local tide-gauge calibration pending.",
        "notes": [
            "Mumbai's tidal range is much larger than Chennai's, so these storm-water levels likely understate risk "
            "until local tide-gauge data (PSMSL Apollo Bandar) is added during onboarding.",
            "Land sinking: a city peak of 26.1 mm/yr is published, but no locality-level hotspots are modelled yet.",
        ],
    },
    "kochi": {
        "id": "kochi",
        "name": "Kochi, Kerala",
        "short": "Kochi",
        "state": "Kerala",
        "country": "India",
        "coast": "Arabian Sea (west coast) with backwaters",
        "center": [9.98, 76.28],
        "zoom": 12,
        "bbox": [9.85, 76.18, 10.12, 76.40],
        "sea_bearing_deg": 270,
        "ocean_point": [9.97, 76.15],
        "utm_epsg": 32643,
        "grid_step_deg": 0.006,
        "dem_block": 5,
        "subsidence_peak_mm_yr": 0.0,
        "subsidence_radius_km": 1.5,
        "subsidence_hotspots": [],
        "utilities": "KSEB (Kerala State Electricity Board)",
        "disaster_authority": "Kerala State Disaster Management Authority",
        "surge_reference": "Storm levels use the same test values as Chennai; local tide-gauge calibration pending.",
        "notes": [
            "Kochi's backwaters are only partly treated as open water by the elevation data, so some backwater "
            "edges may show as flooded land.",
            "No published land-sinking rates are modelled for Kochi yet.",
        ],
    },
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

# Extreme-water allowance on top of mean sea level: storm surge + astronomical tide (m).
# Reference: IMD report on Cyclone Vardah (Dec 2016): ~1 m surge above a 0.47 m tide, ~1.47 m total.
SURGE_LEVELS = [
    {"value": 0.5, "label": "High tide only (0.5 m)"},
    {"value": 1.0, "label": "Moderate storm (1.0 m)"},
    {"value": 1.5, "label": "Strong cyclone (1.5 m)"},
    {"value": 2.0, "label": "Severe cyclone (2.0 m)"},
]
SURGE_VALUES = [s["value"] for s in SURGE_LEVELS]
DEFAULT_SURGE = 1.5

# ---------------------------------------------------------------------------
# Risk model parameters (see docs/METHODOLOGY.md)
# ---------------------------------------------------------------------------
MODEL = {
    # Default extra water on top of mean sea level (tide + storm surge); see SURGE_LEVELS.
    "extreme_water_allowance_m": 1.5,
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
    {"layer": "Ground elevation", "name": "Copernicus DEM GLO-30 (30 m) via Microsoft Planetary Computer",
     "url": "https://planetarycomputer.microsoft.com/dataset/cop-dem-glo-30", "licence": "Copernicus DEM licence"},
    {"layer": "Storm surge reference", "name": "IMD report on Cyclone Vardah (2016)",
     "url": "https://rsmcnewdelhi.imd.gov.in/uploads/report/26/26_af079d_vardah.pdf", "licence": "Public"},
    {"layer": "Sea-level rise projections", "name": "IPCC AR6 sea-level projections (NASA Sea Level Projection Tool)",
     "url": "https://sealevel.nasa.gov/data_tools/17", "licence": "Public"},
    {"layer": "Land subsidence", "name": "Sadhasivam et al., Nature Sustainability (2025); NISAR / Sentinel-1 planned",
     "url": "https://doi.org/10.1038/s41893-025-01663-0", "licence": "Public"},
    {"layer": "Marine heatwaves", "name": "NOAA Coral Reef Watch Marine Heatwave Watch (5 km)",
     "url": "https://coralreefwatch.noaa.gov/product/marine_heatwave/", "licence": "Public domain"},
    {"layer": "Sea surface temperature", "name": "Open-Meteo Marine API",
     "url": "https://open-meteo.com/en/docs/marine-weather-api", "licence": "CC BY 4.0"},
    {"layer": "Wind, humidity, temperature", "name": "ERA5 reanalysis via Open-Meteo Historical API",
     "url": "https://open-meteo.com/en/docs/historical-weather-api", "licence": "CC BY 4.0"},
    {"layer": "Neighbourhood names", "name": "OpenStreetMap places (suburb / neighbourhood)",
     "url": "https://www.openstreetmap.org/copyright", "licence": "ODbL"},
    {"layer": "Coastal vulnerability (reference)", "name": "INCOIS Coastal Vulnerability Index",
     "url": "https://incois.gov.in/documents/ITCOocean/Coastal_Vulnerability_Mapping.pdf", "licence": "Reference"},
]
