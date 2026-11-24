import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import { ArrowRight, Waves, TrendingDown, ThermometerSun, AlarmClock, PlayCircle, CheckCircle2, Building2, Hospital, MapPinned } from "lucide-react";
import DataNetwork from "../components/DataNetwork";
import TrendCharts from "../components/TrendCharts";
import ActionCard from "../components/ActionCard";
import { SOLUTIONS } from "../lib/solutions";
import { Panel } from "../components/ui";
import { PHASES, ROLES, phaseOf, floodYearText, typeLabel } from "../lib/utils";

const CANDIDATES = [
  { name: "Visakhapatnam", lat: 17.69, lon: 83.22 },
  { name: "Mangaluru", lat: 12.91, lon: 74.86 },
  { name: "Colombo", lat: 6.93, lon: 79.85 },
  { name: "Chattogram", lat: 22.34, lon: 91.81 },
  { name: "Durban", lat: -29.86, lon: 31.02 },
  { name: "Perth", lat: -31.95, lon: 115.86 },
  { name: "Miami", lat: 25.76, lon: -80.19 },
];

const HORIZONS = [
  { when: "This week", page: "storm", what: "Storm Watch: forecast alerts, which substations go under in a cyclone, shutdown order, checklist." },
  { when: "Before the monsoon", page: "area", what: "Area & People: which neighbourhoods and hospitals are exposed, what each should prepare." },
  { when: "Next 5 years", page: "plan", what: "Investment Plan: ranked list, budget split, funding routes, execution tracking." },
  { when: "2050 and beyond", page: "future", what: "Future Map + Safe Sites: where the grid must move, and where new solar + batteries should go." },
];

const COMPARE = [
  ["Live wind, rain, temperature & wave maps", true, true],
  ["Animated forecast timeline", true, true],
  ["Sea-level rise 2030–2100 by emissions path", false, true],
  ["Which substation floods, and in which year", false, true],
  ["Neighbourhoods & hospitals affected", false, true],
  ["What to do: action cards, shutdown order, checklist", false, true],
  ["Ranked investment plan, budget & execution tracking", false, true],
  ["Safe sites for new solar + battery", false, true],
  ["Free, no sign-up", "varies", true],
];

export default function Home({ regions, region, regionInfo, priorities, assets, areaImpact, ocean, go, chooseRole, year, scenario, built }) {
  const city = regionInfo?.short || "Chennai";
  const types = useMemo(() => {
    const c = {};
    assets.forEach((f) => (c[f.properties.type] = (c[f.properties.type] || 0) + 1));
    return c;
  }, [assets]);
  const phaseCount = useMemo(() => {
    const c = {};
    priorities.forEach((r) => (c[phaseOf(r)] = (c[phaseOf(r)] || 0) + 1));
    return c;
  }, [priorities]);
  const mhwDays = ocean?.marine_heatwave?.mhw_days_last_year;
  const sink = regionInfo?.subsidence?.peak_mm_yr;

  return (
    <div className="page home">
      {/* 1. HOOK */}
      <section className="hero-panel">
        <p className="eyebrow">CHENNAI · DECEMBER 2023 · CYCLONE MICHAUNG</p>
        <h2>
          The 230 kV KITS Park substation stood under <em>five feet of water</em>. It was switched back on only{" "}
          <em>six days</em> later. Afterwards, the utility decided to move substations out of low-lying areas.
        </h2>
        <p className="hero-sub">
          That decision came <b>after</b> the damage. CoastGrid Twin lets a state make it <b>years before</b>: a digital
          copy of a coastal city's power grid that knows which substation the sea will reach, in which year, what to do
          about it, what it will cost, and where to build next.
        </p>
        <div className="hero-actions">
          <button className="primary-button inline" onClick={() => go("future")}><PlayCircle size={18} /> Play the future of {city}</button>
          <button className="link-button" onClick={() => go("storm")}>Open Storm Watch <ArrowRight size={14} /></button>
          <a className="hero-source" href="https://transformer-magazine.com/news/tangedco-to-move-substations-and-transmission-towers/" target="_blank" rel="noreferrer">
            Source: Transformer Magazine, 11 Dec 2023
          </a>
        </div>
      </section>

      {/* 2. PROBLEM */}
      <Panel title="1 · The problem: nobody knows beforehand" subtitle="Four forces act on a coastal grid at once, and today they are only discovered after an outage">
        <div className="card-grid four">
          <div className="mini-card threat"><Waves size={22} /><h3>The sea is rising</h3>
            <p>IPCC AR6 projects 0.44–0.77 m of global sea-level rise by 2100 (median, low to high emissions). Every storm starts from a higher sea.</p></div>
          <div className="mini-card threat"><TrendingDown size={22} /><h3>The land is sinking</h3>
            <p>{sink ? `Parts of ${city} are sinking at up to ${sink} mm a year (satellite study, 2025)` : `Sinking rates for ${city} are not yet published`}, mostly from groundwater pumping.</p></div>
          <div className="mini-card threat"><ThermometerSun size={22} /><h3>Hot, salty air</h3>
            <p>{mhwDays !== undefined ? `The sea off ${city} spent ${mhwDays} days in a marine heatwave last year (NOAA). ` : ""}Heat cuts transformer capacity; salt spray corrodes and causes flashovers.</p></div>
          <div className="mini-card threat"><AlarmClock size={22} /><h3>Decisions come too late</h3>
            <p>Grid plans look at load growth, not at which site will be underwater in 2040. Fixes happen after the flood, at the highest cost.</p></div>
        </div>
      </Panel>

      <Panel title={`The numbers for ${city}`} subtitle="From our model: how the picture changes decade by decade (strong-cyclone storm level)">
        <TrendCharts region={region} surge={1.5} scenario={scenario} />
      </Panel>

      {/* 3. SOLUTION */}
      <Panel title="2 · The solution: a digital twin that watches the coast" subtitle="Satellites, ocean networks, weather and grid data feed one model that turns them into decisions">
        <DataNetwork />
        <p className="chart-source">LIVE = working in this prototype today. PLANNED = connected when a state adopts it (agency data-sharing agreements).</p>
      </Panel>

      <section className="week-actions">
        <h2 className="section-title">If you face this, do this</h2>
        <p className="section-sub">The seven threats to a coastal grid, what each one does, and the practical fix. The app shows the right cards for every site and for this week's forecast.</p>
        <div className="action-grid">
          {Object.keys(SOLUTIONS).map((k) => <ActionCard key={k} threat={k} />)}
        </div>
      </section>

      <Panel title="How this compares with weather & surf sites" subtitle="Sites such as Zoom Earth, Windy, surf-forecast.com and Buoyweather are excellent at showing the weather. CoastGrid Twin uses the same kind of forecast data, then tells you what it means for the grid and what to do.">
        <div className="table-wrap">
          <table className="data-table compare">
            <thead><tr><th>Feature</th><th>Weather / surf sites</th><th>CoastGrid Twin</th></tr></thead>
            <tbody>
              {COMPARE.map(([f, a, b]) => (
                <tr key={f}><td>{f}</td>
                  <td className={a === true ? "yes" : a === false ? "no" : "mid"}>{a === true ? "✓" : a === false ? "✗" : "Varies (some lock longer forecasts behind a subscription)"}</td>
                  <td className="yes">{b ? "✓" : "✗"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 4. PLANNING */}
      <Panel title="3 · Planning: from this week to 2100" subtitle="The same twin answers short-term and long-term questions">
        <div className="timeline">
          {HORIZONS.map((h, i) => (
            <button key={h.when} className="timeline-step" onClick={() => go(h.page)}>
              <span className="timeline-dot">{i + 1}</span>
              <b>{h.when}</b>
              <p>{h.what}</p>
            </button>
          ))}
        </div>
      </Panel>

      {/* 5. COST & EXECUTION */}
      <Panel title="4 · Cost and execution" subtitle={`${city}, ${year}, ${scenario.toUpperCase()} · every asset is placed in a spending phase`}
        right={<button className="link-button" onClick={() => go("plan")}>Open the plan <ArrowRight size={14} /></button>}>
        {built ? (
          <div className="phase-strip">
            {PHASES.map((p) => (
              <div key={p.id} style={{ borderTopColor: p.color }}>
                <b style={{ color: p.color }}>{phaseCount[p.id] || 0}</b>
                <span>{p.label}</span>
                <small>{p.when}</small>
              </div>
            ))}
          </div>
        ) : <p className="empty-message">Available once {city}'s data is built.</p>}
        <p className="muted">
          The utility enters its own unit costs (no invented prices). The plan then shows what a budget covers, in rank order,
          and which funding route fits each phase: distribution-strengthening schemes, disaster-mitigation funds,
          regulator-approved capital plans or climate finance. Field teams mark each job as approved, in progress or done.
        </p>
      </Panel>

      {/* 6. USERS & PLANTS */}
      <Panel title="5 · Who uses it, and for which plants" subtitle="Choose a role: the app shows only the screens that job needs">
        <div className="card-grid four">
          {ROLES.map((r) => (
            <button key={r.id} className="mini-card role-card" onClick={() => chooseRole(r.id, r.pages[0])}>
              <h3>{r.name}</h3>
              <small>{r.who}</small>
              <p>“{r.question}”</p>
              <span className="role-go">Open my screens <ArrowRight size={13} /></span>
            </button>
          ))}
        </div>
        {built && (
          <div className="plants-row">
            <div className="plants-counts">
              <h4><Building2 size={16} /> Tracked in {city}</h4>
              {Object.entries(types).map(([t, n]) => <span key={t}><b>{n}</b> {typeLabel(t).toLowerCase()}{n > 1 ? "s" : ""}</span>)}
            </div>
            <div className="plants-top">
              <h4>Most urgent right now</h4>
              {priorities.slice(0, 3).map((r) => (
                <button key={r.id} onClick={() => go("asset", r.id)}>
                  <b>#{r.rank} {r.name}</b> · {typeLabel(r.type)}{r.voltage_kv ? ` ${r.voltage_kv} kV` : ""} · floods {floodYearText(r.flood_year)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* 7. AREA */}
      <Panel title="6 · Beyond the power station: the area around it" subtitle="When a substation floods, the neighbourhood and its hospitals go dark too"
        right={<button className="link-button" onClick={() => go("area")}>Area & People <ArrowRight size={14} /></button>}>
        {areaImpact ? (
          <div className="card-grid three">
            <div className="mini-card"><MapPinned size={20} className="mini-icon" /><h3>{areaImpact.flooded_places.length} of {areaImpact.totals.places}</h3><p>named neighbourhoods under sea water in this future</p></div>
            <div className="mini-card"><Hospital size={20} className="mini-icon" /><h3>{areaImpact.flooded_hospitals.length}</h3><p>hospitals standing in flooded land</p></div>
            <div className="mini-card"><Hospital size={20} className="mini-icon" /><h3>{areaImpact.hospitals_near_high_risk_substations.length}</h3><p>hospitals within 3 km of a high-risk substation: candidates for backup supply</p></div>
          </div>
        ) : <p className="empty-message">Area data appears after the pipeline has been re-run for {city}.</p>}
      </Panel>

      {/* 8. EASY */}
      <div className="two-col">
        <Panel title="7 · Easy to operate" subtitle="Built for duty officers and engineers, not data scientists">
          <ul className="check-list">
            <li>Runs in any browser, nothing to install, no paid licences: all data is free and public.</li>
            <li>Pick your role and city: you only see the screens your job needs.</li>
            <li>Plain sentences such as "floods around 2047", with red / amber / green everywhere.</li>
            <li>Every site has a printable one-page card for the field team.</li>
            <li>Every number links to its source on the Evidence page.</li>
            <li>An open API lets the utility's control room and GIS tools pull the same data.</li>
          </ul>
        </Panel>
        <Panel title="8 · Built to scale to any coastline" subtitle="Live in 3 Indian cities; the same pipeline onboards a new city from a configuration file">
          <div className="map-container" style={{ height: 260 }}>
            <MapContainer center={[5, 30]} zoom={1} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
              <TileLayer attribution="&copy; OpenStreetMap &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              {CANDIDATES.map((c) => (
                <CircleMarker key={c.name} center={[c.lat, c.lon]} radius={5} pathOptions={{ color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.6 }}>
                  <Tooltip>{c.name}: candidate</Tooltip>
                </CircleMarker>
              ))}
              {regions.map((r) => (
                <CircleMarker key={r.id} center={r.center} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: r.built ? "#21d4bd" : "#38bdf8", fillOpacity: 1 }}>
                  <Tooltip>{r.name}: {r.built ? "live" : "onboarding"}</Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <div className="map-legend">
            <span><i className="dot" style={{ background: "#21d4bd" }}></i> Live</span>
            <span><i className="dot" style={{ background: "#38bdf8" }}></i> Onboarding</span>
            <span><i className="dot" style={{ background: "#fbbf24" }}></i> Candidate (east- or west-facing coasts)</span>
          </div>
        </Panel>
      </div>

      <section className="closing">
        <CheckCircle2 size={22} />
        <p>
          <b>The ask:</b> pilot with one state utility's real asset register for one city. That means one monsoon season of
          Storm Watch, and the twin's ranking becomes part of the next capital-investment plan.
        </p>
      </section>
    </div>
  );
}
