import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import AssetMap from "../components/AssetMap";
import { InfoBox, Panel } from "../components/ui";
import { downloadText, toCSV, scenarioOf } from "../lib/utils";

export default function SafeSites({ safeSites, assets, model, region, scenario }) {
  const sites = safeSites?.features || [];
  const [focus, setFocus] = useState(null);

  const csv = () =>
    downloadText(
      `coastgrid_safe_sites_${scenario}.csv`,
      toCSV(sites, [
        { label: "Rank", get: (f) => f.properties.rank },
        { label: "Latitude", get: (f) => f.geometry.coordinates[1] },
        { label: "Longitude", get: (f) => f.geometry.coordinates[0] },
        { label: "Ground elevation (m)", get: (f) => f.properties.ground_elev_m },
        { label: "Height above worst-case 2100 water (m)", get: (f) => f.properties.margin_2100_m },
        { label: "Distance from sea (km)", get: (f) => f.properties.dist_coast_km },
        { label: "Distance to nearest substation (km)", get: (f) => f.properties.nearest_substation_km },
        { label: "Score", get: (f) => f.properties.score },
      ])
    );

  return (
    <div className="page">
      <InfoBox steps={["Pick an emissions path above (the 2100 worst case is used).", "Click a row to zoom the map to that site.", "Download the list for a site survey."]}>
        Where should new solar panels and batteries go so they are not the next thing to flood? These are spots of high
        ground close to an existing substation (cheap to connect) that stay dry even in the worst case.
      </InfoBox>

      <Panel title="How a site qualifies" subtitle={`Using ${scenarioOf(scenario).label}, upper (83rd percentile) sea level in 2100 + a 2 m severe-cyclone surge`}>
        <div className="card-grid four">
          <div className="mini-card"><h3>≥ {model.safe_min_margin_m ?? 2} m</h3><p>above the worst-case 2100 storm water</p></div>
          <div className="mini-card"><h3>≥ {model.safe_min_coast_km ?? 2} km</h3><p>from the sea (less salt and spray)</p></div>
          <div className="mini-card"><h3>≤ {model.safe_max_substation_km ?? 4} km</h3><p>from a substation, so connection is short</p></div>
          <div className="mini-card"><h3>≥ {model.safe_min_spacing_km ?? 1} km apart</h3><p>so sites are spread across the city</p></div>
        </div>
      </Panel>

      <div className="two-col wide-left">
        <Panel title="Map" subtitle="Dashed teal circles = recommended sites">
          <AssetMap assets={assets} safeSites={safeSites} model={model} focus={focus}
            layers={{ assets: true, flood: false, safe: true, sinking: false }}
            center={region?.center} height={480} />
        </Panel>
        <Panel title={`Top ${sites.length} sites`} right={<button className="link-button" onClick={csv} disabled={!sites.length}><Download size={15} /> CSV</button>}>
          <div className="table-wrap tall">
            <table className="data-table clickable">
              <thead><tr><th>#</th><th>Ground</th><th>Above 2100 water</th><th>From sea</th><th>To grid</th><th></th></tr></thead>
              <tbody>
                {sites.map((f) => {
                  const p = f.properties;
                  const [lon, lat] = f.geometry.coordinates;
                  return (
                    <tr key={p.rank} onClick={() => setFocus([lat, lon])}>
                      <td>{p.rank}</td>
                      <td>{p.ground_elev_m} m</td>
                      <td>+{p.margin_2100_m} m</td>
                      <td>{p.dist_coast_km} km</td>
                      <td>{p.nearest_substation_km} km</td>
                      <td>
                        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()} title="Open in OpenStreetMap"><ExternalLink size={14} /></a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="chart-source">
            These are screening results from 30 m satellite elevation. Land ownership, land use and a site visit still
            need to be checked before building.
          </p>
        </Panel>
      </div>
    </div>
  );
}
