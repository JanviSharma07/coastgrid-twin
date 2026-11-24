import { ExternalLink, Download, Database, Cpu, Layers, Gauge, ListChecks, PlusCircle } from "lucide-react";
import { InfoBox, Panel } from "../components/ui";
import { API_BASE } from "../services/api";
import { PRIORITY_COLUMNS, downloadText, toCSV } from "../lib/utils";

const STEPS = [
  { icon: Database, t: "1. Collect", d: "Grid assets, hospitals and neighbourhoods (OpenStreetMap); 30 m ground height (Copernicus); sea-level rise (IPCC AR6); sea heat (NOAA); wind & humidity (ERA5)." },
  { icon: Layers, t: "2. Build the twin", d: "Each asset gets ground height, equipment base, distance to sea, nearby hospitals and land-sinking rate." },
  { icon: Cpu, t: "3. Run the futures", d: "3 emissions paths × 8 decades × 4 storm sizes: storm water level and which land floods (connected to the sea)." },
  { icon: Gauge, t: "4. Score", d: "Flood, heat and salt scored 0–1, combined, then weighted by importance." },
  { icon: ListChecks, t: "5. Act", d: "Rank, recommend, phase, cost, find safe sites, warn before storms." },
];

const GLOSSARY = [
  ["Emissions path (SSP)", "A storyline for future greenhouse gas: SSP1-2.6 strong cuts, SSP2-4.5 middle road, SSP5-8.5 very high."],
  ["Storm surge", "Sea water pushed onto land by a cyclone, on top of the tide. Cyclone Vardah (2016): about 1 m surge on a 0.47 m tide in Chennai (IMD)."],
  ["Equipment base / plinth", "The platform the transformer and switchgear stand on."],
  ["Safety margin", "Equipment base minus storm water level. Negative = flooded."],
  ["Land subsidence", "The ground sinking, mostly from groundwater pumping."],
  ["Marine heatwave", "A spell of unusually warm sea (NOAA categories: moderate, strong, severe, extreme)."],
  ["Importance (criticality)", "Higher voltage and hospitals nearby mean more people depend on the asset."],
  ["Flashover", "An electrical short across an insulator, often from a wet salt layer."],
];

export default function Evidence({ meta, regionInfo, priorities, risk, safeSites, scenario, year, surge, region }) {
  const m = meta?.model || {};
  const q = `region=${region}&scenario=${scenario}&year=${year}&surge=${surge}`;
  const endpoints = [
    ["Assets with risk (GeoJSON)", `/api/risk?${q}`],
    ["Ranked priority list", `/api/priorities?${q}&limit=20`],
    ["Flooded area (GeoJSON)", `/api/flood-zones?${q}`],
    ["Neighbourhoods & hospitals affected", `/api/area-impact?${q}`],
    ["Safe solar + battery sites", `/api/safe-sites?region=${region}&scenario=${scenario}`],
    ["Ocean heat & wind", `/api/ocean?region=${region}`],
    ["Model settings, cities & sources", `/api/meta`],
  ];
  const tag = `${region}_${scenario}_${year}_surge${surge}`;

  return (
    <div className="page">
      <InfoBox>
        The screen for anyone who asks "can I trust this?": how the numbers are made, where each one comes from, what
        the model does not cover yet, and how to get the data out.
      </InfoBox>

      <Panel title="From data to decisions in 5 steps">
        <div className="card-grid five">
          {STEPS.map(({ icon: Icon, t, d }) => (
            <div className="mini-card" key={t}><Icon size={20} className="mini-icon" /><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="The formula in plain words">
          <ol className="explain-list numbered">
            <li><b>Storm water level</b> = sea-level rise for that year + land sinking since 2020 + storm surge.</li>
            <li><b>Safety margin</b> = equipment base (ground + {m.default_plinth_m ?? 0.3} m plinth) − storm water level.</li>
            <li><b>Flood score</b> = 1 − margin ÷ {m.flood_margin_scale_m ?? 2} m, kept between 0 and 1.</li>
            <li><b>Heat score</b> halves about every {Math.round((m.heat_decay_km ?? 10) * 0.69)} km from the sea, scaled by last year's marine-heatwave days and humidity.</li>
            <li><b>Salt score</b> halves about every {((m.salt_decay_km ?? 3) * 0.69).toFixed(1)} km, scaled by how often wind blows from the sea.</li>
            <li><b>Importance</b> = 80% voltage level (power plants count as top level) + 20% hospitals within {m.hospital_radius_km ?? 3} km.</li>
            <li><b>Risk</b> = ({m.w_flood ?? 0.6} × flood + {m.w_heat ?? 0.2} × heat + {m.w_salt ?? 0.2} × salt) × ({m.crit_floor ?? 0.6} + {(1 - (m.crit_floor ?? 0.6)).toFixed(1)} × importance). High ≥ {m.high ?? 0.55}, medium ≥ {m.medium ?? 0.3}.</li>
            <li><b>Flooded land</b>: grid cells (~150 m) below the storm water level <i>and</i> connected to the sea; harbours and creeks already under water are excluded.</li>
          </ol>
        </Panel>

        <Panel title="Limitations, stated up front">
          <ul className="explain-list">
            <li>Sea-level rise uses IPCC AR6 <b>global-average</b> values; city-specific values from the NASA tool are the next upgrade.</li>
            <li>Equipment heights are <b>estimated</b> (ground + 0.3 m) until the utility provides real plinth heights.</li>
            <li>"Bathtub" flooding: sea walls and drains are not included.</li>
            <li><b>Rain-driven flooding is not modelled yet</b> (the main cause of the 2015 Chennai floods and the Michaung outages).</li>
            <li>The same storm-surge test levels are used in every city; local tide-gauge calibration is part of onboarding.</li>
            <li>OpenStreetMap may miss assets or voltages; 30 m satellite heights can include buildings and trees.</li>
            <li>Results are for <b>screening and planning</b>, not a replacement for engineering surveys.</li>
            {regionInfo?.notes?.map((n) => <li key={n}><b>{regionInfo.short}:</b> {n}</li>)}
          </ul>
        </Panel>
      </div>

      <Panel title="Data sources" subtitle="All free and public: no paid services, no payment details anywhere">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>What</th><th>Source</th><th>Licence</th></tr></thead>
            <tbody>
              {(meta?.sources || []).map((s) => (
                <tr key={s.name}><td>{s.layer}</td><td><a href={s.url} target="_blank" rel="noreferrer">{s.name} <ExternalLink size={12} /></a></td><td>{s.licence}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="Downloads" subtitle="For engineers (Excel) and GIS teams (QGIS / ArcGIS)">
          <div className="download-list">
            <button className="link-button" disabled={!priorities.length} onClick={() => downloadText(`coastgrid_priorities_${tag}.csv`, toCSV(priorities, PRIORITY_COLUMNS))}><Download size={15} /> Priority list (CSV)</button>
            <button className="link-button" disabled={!risk} onClick={() => downloadText(`coastgrid_assets_${tag}.geojson`, JSON.stringify(risk), "application/geo+json")}><Download size={15} /> Assets with risk (GeoJSON)</button>
            <button className="link-button" disabled={!safeSites} onClick={() => downloadText(`coastgrid_safe_sites_${region}_${scenario}.geojson`, JSON.stringify(safeSites), "application/geo+json")}><Download size={15} /> Safe sites (GeoJSON)</button>
          </div>
        </Panel>
        <Panel title="Open API" subtitle="Free, no key: connect the twin to control-room and GIS software"
          right={<a className="link-button" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">API docs <ExternalLink size={13} /></a>}>
          <ul className="endpoint-list">
            {endpoints.map(([label, path]) => (
              <li key={path}><span>{label}</span><a href={`${API_BASE}${path}`} target="_blank" rel="noreferrer"><code>GET {path.split("?")[0]}</code></a></li>
            ))}
            <li><span>What-if simulation</span><code>POST /api/simulate</code></li>
          </ul>
        </Panel>
      </div>

      <Panel title="Add a city" subtitle="How Mumbai and Kochi were added, and how any east- or west-facing coastal city can be" right={<PlusCircle size={18} color="#2dd4bf" />}>
        <ol className="explain-list numbered">
          <li>Add the city to the configuration: bounding box, which side the sea is on, an offshore point, map projection zone, and any published land-sinking hotspots.</li>
          <li>Run one command: <code>python -m app.pipeline.build --region &lt;city&gt;</code>. It downloads all free data and computes every future.</li>
          <li>Calibrate during onboarding: the utility's asset register and real plinth heights, local tide-gauge levels, and city sea-level projections.</li>
          <li>Hand over: the city appears in the city switcher for every role.</li>
        </ol>
      </Panel>

      <Panel title="Words used in this app">
        <dl className="glossary">{GLOSSARY.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
      </Panel>
    </div>
  );
}
