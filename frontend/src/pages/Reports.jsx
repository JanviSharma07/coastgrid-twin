import { Download, Printer, ExternalLink, Upload } from "lucide-react";
import { InfoBox, Panel, RiskBadge } from "../components/ui";
import { API_BASE } from "../services/api";
import { PRIORITY_COLUMNS, downloadText, floodYearText, toCSV, scenarioOf, surgeOf, typeLabel } from "../lib/utils";

export default function Reports({ priorities, risk, safeSites, summary, scenario, year, surge, meta, region }) {
  const tag = `${scenario}_${year}_surge${surge}`;
  const q = `region=chennai&scenario=${scenario}&year=${year}&surge=${surge}`;
  const endpoints = [
    ["Assets with risk (GeoJSON)", `/api/risk?${q}`],
    ["Ranked priority list", `/api/priorities?${q}&limit=20`],
    ["Flooded area (GeoJSON)", `/api/flood-zones?${q}`],
    ["Safe solar + battery sites", `/api/safe-sites?region=chennai&scenario=${scenario}`],
    ["Sea-level projections", `/api/sea-level?region=chennai`],
    ["Ocean heat & wind", `/api/ocean?region=chennai`],
    ["Model settings & sources", `/api/meta`],
  ];
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page">
      <InfoBox steps={["Pick the future with the boxes above.", "Download data files, or press “Print / Save as PDF” for a meeting-ready report.", "Developers can call the open API directly."]}>
        Everything you see in the app can leave the app: as spreadsheets for engineers, map files for GIS teams, a
        printable report for managers, or live data for other software through our free API.
      </InfoBox>

      <div className="two-col">
        <Panel title="Downloads" subtitle={`${scenarioOf(scenario).label} · ${year} · ${surgeOf(surge).label}`}>
          <div className="download-list">
            <button className="link-button" disabled={!priorities.length}
              onClick={() => downloadText(`coastgrid_priorities_${tag}.csv`, toCSV(priorities, PRIORITY_COLUMNS))}>
              <Download size={15} /> Priority list (CSV, opens in Excel)
            </button>
            <button className="link-button" disabled={!risk}
              onClick={() => downloadText(`coastgrid_assets_${tag}.geojson`, JSON.stringify(risk), "application/geo+json")}>
              <Download size={15} /> Assets with risk (GeoJSON for QGIS / ArcGIS)
            </button>
            <button className="link-button" disabled={!safeSites}
              onClick={() => downloadText(`coastgrid_safe_sites_${scenario}.geojson`, JSON.stringify(safeSites), "application/geo+json")}>
              <Download size={15} /> Safe sites (GeoJSON)
            </button>
            <button className="primary-button" onClick={() => window.print()}>
              <Printer size={16} /> Print / Save as PDF report
            </button>
          </div>
        </Panel>

        <Panel title="Open API" subtitle="Free, no key needed: plug the twin into dashboards or control-room software"
          right={<a className="link-button" href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">API docs <ExternalLink size={13} /></a>}>
          <ul className="endpoint-list">
            {endpoints.map(([label, path]) => (
              <li key={path}>
                <span>{label}</span>
                <a href={`${API_BASE}${path}`} target="_blank" rel="noreferrer"><code>GET {path.split("?")[0]}</code></a>
              </li>
            ))}
            <li><span>What-if simulation</span><code>POST /api/simulate</code></li>
          </ul>
        </Panel>
      </div>

      <Panel title="Coming next: upload your own assets" right={<Upload size={18} color="#fbbf24" />}
        subtitle="Planned, not in this version">
        <p className="muted">
          Today the asset list comes from OpenStreetMap and equipment heights are estimated (ground + 0.3 m). A utility
          will be able to upload a CSV with its real substations and plinth heights, and every page will recalculate on
          its own data.
        </p>
      </Panel>

      {/* Report preview: this is what gets printed */}
      <section className="print-area panel">
        <div className="report-head">
          <div>
            <p className="eyebrow">COASTGRID TWIN · CLIMATE RISK REPORT</p>
            <h2>{region?.name || "Chennai, Tamil Nadu"} power grid</h2>
            <p className="muted">Generated {today} · {scenarioOf(scenario).label} · year {year} · {surgeOf(surge).label}</p>
          </div>
        </div>

        <h3>Summary</h3>
        <p>
          Of {summary.total ?? "–"} power assets tracked, <b>{summary.high ?? "–"} are high risk</b>, {summary.medium ?? "–"} medium and{" "}
          {summary.low ?? "–"} low. About <b>{summary.flood_area_km2 ?? "–"} km²</b> of land would be under sea water, with{" "}
          {summary.assets_flooded ?? "–"} assets having water at their equipment base. {safeSites?.features?.length ?? 0} safe sites
          were found for new solar + battery.
        </p>

        <h3>Top 15 priorities</h3>
        <table className="data-table report-table">
          <thead><tr><th>#</th><th>Asset</th><th>Risk</th><th>First flooded</th><th>Margin</th><th>Action</th></tr></thead>
          <tbody>
            {priorities.slice(0, 15).map((r) => (
              <tr key={r.id}>
                <td>{r.rank}</td>
                <td>{r.name} <small>({typeLabel(r.type)}{r.voltage_kv ? `, ${r.voltage_kv} kV` : ""})</small></td>
                <td><RiskBadge level={r.risk_level} /> {r.risk_score}</td>
                <td>{floodYearText(r.flood_year)}</td>
                <td>{r.margin_m} m</td>
                <td>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Method in brief</h3>
        <p className="muted">
          Storm water level = projected sea-level rise (IPCC AR6) + local land sinking + storm surge. Each asset's flood
          danger compares this with its equipment base (ground from Copernicus 30 m elevation + assumed 0.3 m plinth).
          Heat and salt stress fall with distance from the sea and are scaled by marine heatwaves (NOAA) and onshore wind
          (ERA5). Risk = (0.6 flood + 0.2 heat + 0.2 salt) × (0.6 + 0.4 importance).
        </p>
        <h3>Data sources</h3>
        <ul className="source-list">
          {(meta?.sources || []).map((s) => <li key={s.name}>{s.layer}: {s.name}</li>)}
        </ul>
        <p className="muted small">Screening-level results for planning. Confirm with site surveys before construction.</p>
      </section>
    </div>
  );
}
