# Methodology

CoastGrid Twin estimates, for every coastal power asset, **when** it will flood, **how much** heat and
salt stress it faces, and **what to fix first**. All inputs are free, public datasets.

## 1. Data

| Layer | Source | Notes |
|---|---|---|
| Power assets | OpenStreetMap (Overpass API) | Substations, power plants, solar and battery sites. Features of the same type within 150–500 m (for example, individually mapped solar panel rows) are merged into one installation. Real deployments would use the utility's asset register. |
| Hospitals, coastline | OpenStreetMap | Hospitals within 3 km raise an asset's criticality. |
| Ground elevation | Copernicus DEM GLO-30 (30 m) via Microsoft Planetary Computer (AWS Open Data mirror; Open-Meteo 90 m as fallback) | A surface model: buildings and trees can raise values in dense areas. For flood modelling the 30 m grid is aggregated to ~150 m cells using the 20th percentile, which keeps creeks and ground between buildings. |
| Storm surge + tide | IMD report on Cyclone Vardah (2016): ~1 m surge above a 0.47 m tide | Four levels: 0.5 m (high tide only), 1.0 m, 1.5 m (Vardah-like, default), 2.0 m (severe). |
| Sea-level rise | IPCC AR6 projections (NASA Sea Level Projection Tool) | Median and likely range (17th–83rd percentile), relative to 1995–2014. Until a region file is added, the global-mean AR6 values are used and labelled as interim. |
| Land subsidence | Published Chennai hotspots (Nature Sustainability, 2025): peak 31.7 mm/yr | Applied around the reported localities, tapering to zero within 1.5 km. To be replaced with NISAR (NASA–ISRO) or Sentinel-1 InSAR rates. |
| Marine heatwaves | NOAA Coral Reef Watch Marine Heatwave Watch (5 km, daily) | Days in a marine heatwave over the last 365 days, nearest ocean pixel. |
| Sea surface temperature | Open-Meteo Marine API | Last 92 days. |
| Wind, humidity | ERA5 reanalysis (Open-Meteo Historical API) | Last full year: share of hours with onshore (sea) wind, mean relative humidity. |

## 2. Model

For each asset, scenario and year:

```
water level  = sea-level rise (AR6, scenario, year)
             + land sinking since 2020 (rate x years)
             + surge (tide + storm surge: 0.5 / 1.0 / 1.5 / 2.0 m, default 1.5 m)

margin       = base elevation - water level        (base = ground + 0.3 m plinth if unknown)
flood score  = 1 - margin / 2 m, clipped to 0..1   (1 = water at or above the base)
flood year   = first year (2025-2150) when water level >= base

heat score   = exp(-distance to coast / 10 km) x (0.5 + 0.5 x climate factor)
               climate factor = 0.5 x min(heatwave days / 90, 1) + 0.5 x humidity factor
salt score   = exp(-distance to coast / 3 km) x (0.4 + 0.6 x onshore wind share)

criticality  = 0.8 x voltage weight (>=220 kV: 1.0, >=110: 0.8, >=33: 0.6, else 0.4; plants 1.0)
             + 0.2 x min(hospitals within 3 km, 5) / 5

risk         = (0.6 flood + 0.2 heat + 0.2 salt) x (0.6 + 0.4 x criticality)
level        = high >= 0.55, medium >= 0.30, else low
```

**Flood zones** use the elevation grid (~150 m cells): land below the water level that is connected to
the sea (water can only spread through neighbouring low cells, so inland hollows do not flood on their own).

**Safe sites** for new solar + battery: cells at least 2 m above the worst-case 2100 water level
(83rd percentile, 2.0 m surge), at least 2 km from the coast and within 4 km of an existing substation for grid
connection, spaced at least 1 km apart.

**Recommendations**: flooding before 2050 (or the chosen year) means *raise or relocate*; a small flood
margin means *flood wall, waterproofing and pumps*; salt-dominant means *polymer insulators and
washing*; heat-dominant means *cooling and load management*; low risk means *monitor*.

## 3. Limitations (stated openly)

- Rain-driven (pluvial) flooding is not yet modelled; a large share of Cyclone Michaung's flooding was
  from extreme rainfall. Planned: IMD rainfall and drainage data.
- Surge is applied evenly along the coast; INCOIS storm-surge maps would vary it by location.
- Equipment base heights are estimated (ground + 0.3 m) unless the utility provides them.
- The elevation model includes buildings and trees; a bare-earth model (for example from lidar) would be more accurate.
- Heat and salt scores are relative indices for ranking assets, not physical measurements.
- The weights are a transparent starting point to be tuned with utility engineers.
