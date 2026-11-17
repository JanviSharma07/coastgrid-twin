Optional region-specific sea-level projections.

Add a file named `<region>.csv` (for example `chennai.csv`) with these columns:

    scenario,year,p17,p50,p83
    ssp245,2030,0.08,0.10,0.12
    ...

Values are metres of rise relative to 1995-2014, taken from the NASA Sea Level Projection Tool
(https://sealevel.nasa.gov/data_tools/17) for the nearest location to the region.
Scenarios: ssp126, ssp245, ssp585. If no file is present, IPCC AR6 global-mean values are used.
