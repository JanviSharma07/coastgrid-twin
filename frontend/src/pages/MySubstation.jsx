import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { MapPin, Printer, LoaderCircle, Table2 } from "lucide-react";
import { getAssetDetail, simulateRisk } from "../services/api";
import { InfoBox, Panel, ScoreBar, RiskBadge } from "../components/ui";
import SideView from "../components/SideView";
import ActionCard from "../components/ActionCard";
import { assetThreats } from "../lib/solutions";
import { SCENARIOS, YEARS, RISK_COLORS, band, floodYearText, scenarioOf, surgeOf, typeLabel, TOOLTIP_STYLE, PHASES, phaseOf } from "../lib/utils";

const HEIGHTS = [0.5, 1, 1.5, 2, 3];
const gainedText = (g) => (g === null || g === undefined ? "no flood risk to fix" : g === "beyond 2150" ? "safe beyond 2150" : `+${g} years`);

function explain(p, r, { year, scenario, surge, model }) {
  const m = r.margin_m;
  const lines = [
    `This ${typeLabel(p.type).toLowerCase()}${p.voltage_kv ? ` (${p.voltage_kv} kV)` : ""} stands on ground about ${p.ground_elev_m} m above sea level, ${p.dist_coast_km} km from the sea. Its equipment base is taken as ${p.base_elev_m} m (ground + ${(p.base_elev_m - p.ground_elev_m).toFixed(1)} m plinth) until the utility enters the real height.`,
    `In ${year}, if ${scenarioOf(scenario).plain}, ${surgeOf(surge).short} would push sea water to ${r.water_level_m} m: ` +
      (m < 0 ? `${Math.abs(m).toFixed(2)} m ABOVE the equipment base. The site would flood.` : `${m.toFixed(2)} m below the equipment base.`),
    r.flood_year ? `Water first reaches the equipment around ${r.flood_year}.` : "Water stays below the equipment until at least 2150.",
  ];
  if (p.subsidence_mm_yr > 0) lines.push(`The ground here is sinking about ${p.subsidence_mm_yr} mm a year, which brings that date closer.`);
  lines.push(`Heat stress is ${band(r.heat_score, model)} (${r.heat_score}) and salt corrosion ${band(r.salt_score, model)} (${r.salt_score}) at this distance from the sea.`);
  lines.push(`${p.hospitals_nearby || 0} hospital(s) lie within 3 km; with its voltage this gives an importance of ${p.criticality}.`);
  return lines;
}

export default function MySubstation(props) {
  const { priorities, selectedId, setSelectedId, region, regionInfo, scenario, year, surge, model } = props;
  const [byScenario, setByScenario] = useState({});
  const [error, setError] = useState("");
  const [viewYear, setViewYear] = useState(year);
  const [raise, setRaise] = useState(0);
  const [sim, setSim] = useState(null);
  const [table, setTable] = useState(null);
  const [busy, setBusy] = useState("");
  const id = selectedId || priorities[0]?.id;

  useEffect(() => setViewYear(year), [year]);
  useEffect(() => {
    setSim(null);
    setTable(null);
    setRaise(0);
  }, [id, scenario, surge, year]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError("");
    Promise.all(SCENARIOS.map((s) => getAssetDetail(id, { scenario: s.id, surge }).then((r) => [s.id, r.data])))
      .then((pairs) => !cancelled && setByScenario(Object.fromEntries(pairs)))
      .catch(() => !cancelled && setError("Could not load this asset. Please try again."));
    return () => {
      cancelled = true;
    };
  }, [id, surge, region]);

  const detail = byScenario[scenario];
  const p = detail?.asset?.properties;
  const row = detail?.timeline?.find((t) => t.year === year);
  const viewRow = detail?.timeline?.find((t) => t.year === viewYear);
  const chartData = useMemo(() => (detail?.timeline || []).map((t) => ({ year: t.year, water: t.water_level_m })), [detail]);
  const coords = detail?.asset?.geometry?.coordinates;
  const rank = priorities.find((r) => r.id === id);
  const phase = rank ? PHASES.find((ph) => ph.id === phaseOf(rank)) : null;

  const body = (h) => ({ asset_id: id, scenario, year: Number(year), raise_m: h, surge: Number(surge) });
  const runSim = async () => {
    setBusy("one");
    try {
      setSim((await simulateRisk(body(raise))).data);
    } catch {
      setError("Simulation failed. Check the server connection.");
    } finally {
      setBusy("");
    }
  };
  const compare = async () => {
    setBusy("table");
    try {
      setTable(await Promise.all(HEIGHTS.map((h) => simulateRisk(body(h)).then((r) => ({ h, ...r.data })))));
    } catch {
      setError("Comparison failed. Check the server connection.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="page">
      <InfoBox steps={["Choose your site (sorted from most urgent).", "Drag the year to watch the water rise around it.", "Drag “raise by” to test an upgrade, then print the one-page card for the field team."]}>
        The engineer's screen: one site explained in plain words. It shows when the sea reaches it, why it scored what
        it did, and what an upgrade would buy. Every site in the city has the same card.
      </InfoBox>

      <Panel>
        <label className="field-label" htmlFor="asset-select">Your site</label>
        <select id="asset-select" className="wide-select" value={id || ""} onChange={(e) => setSelectedId(e.target.value)}>
          {priorities.map((r) => <option key={r.id} value={r.id}>#{r.rank} · {r.name} · {r.risk_level} ({r.risk_score})</option>)}
        </select>
      </Panel>

      {error && <div className="error-banner">{error}</div>}

      {p && row && (
        <>
          <section className="asset-head">
            <div>
              <p className="eyebrow">{typeLabel(p.type).toUpperCase()}{p.voltage_kv ? ` · ${p.voltage_kv} kV` : ""}{rank ? ` · PRIORITY #${rank.rank} OF ${priorities.length}` : ""}</p>
              <h2>{p.name} <RiskBadge level={row.risk_level} /></h2>
              <p className="muted"><MapPin size={13} /> {coords?.[1].toFixed(4)}, {coords?.[0].toFixed(4)} · {regionInfo?.short}{p.operator ? ` · ${p.operator}` : ""}</p>
            </div>
            <div className="big-number"><span>First flooded</span>
              <b style={{ color: row.flood_year ? RISK_COLORS.high : RISK_COLORS.low }}>{floodYearText(row.flood_year)}</b>
              <small>{surgeOf(surge).label}</small></div>
            <div className="big-number"><span>Plan phase</span>
              <b style={{ color: phase?.color, fontSize: 20 }}>{phase?.label}</b><small>{phase?.when}</small></div>
            <button className="link-button" onClick={() => window.print()}><Printer size={15} /> Print site card</button>
          </section>

          <section className="week-actions">
            <h2 className="section-title">Your action plan for this site</h2>
            <div className="action-grid">
              {assetThreats(p, row).map((th) => (
                <ActionCard key={th} threat={th} compact
                  headline={th === "flood" ? (row.flood_year ? `Water reaches the equipment around ${row.flood_year} (${surgeOf(surge).short})` : "Stays dry until 2150, but keep monitoring")
                    : th === "salt" ? `Salt score ${row.salt_score} at ${p.dist_coast_km} km from the sea`
                    : th === "heat" ? `Heat score ${row.heat_score}`
                    : th === "sinking" ? `Ground sinking about ${p.subsidence_mm_yr} mm a year here`
                    : th === "waves" ? `Only ${p.dist_coast_km} km from the shore` : undefined} />
              ))}
            </div>
          </section>

          <div className="two-col">
            <Panel title="See it: water vs. your equipment" subtitle="Drag the year and the raise height">
              {viewRow && <SideView ground={p.ground_elev_m} base={p.base_elev_m} water={viewRow.water_level_m} raise={raise}
                caption={`(${viewYear}, ${scenarioOf(scenario).short}, ${surgeOf(surge).short})`} />}
              <div className="slider-heading"><label>Year</label><strong>{viewYear}</strong></div>
              <input type="range" min={0} max={YEARS.length - 1} value={YEARS.indexOf(viewYear)} onChange={(e) => setViewYear(YEARS[Number(e.target.value)])} aria-label="Year" />
              <div className="slider-heading"><label>Raise equipment by (what-if)</label><strong>{raise.toFixed(1)} m</strong></div>
              <input type="range" min="0" max="5" step="0.5" value={raise} onChange={(e) => { setRaise(Number(e.target.value)); setSim(null); }} aria-label="Raise height" />
              <div className="btn-row">
                <button className="primary-button" onClick={runSim} disabled={!!busy || raise === 0}>
                  {busy === "one" ? <LoaderCircle className="spin" size={16} /> : null} How many years does +{raise} m buy?
                </button>
                <button className="link-button" onClick={compare} disabled={!!busy}>
                  {busy === "table" ? <LoaderCircle className="spin" size={14} /> : <Table2 size={14} />} Compare 0.5–3 m
                </button>
              </div>
              {sim && (
                <div className="simulation-result">
                  <span>WHAT-IF RESULT</span>
                  <h2>{gainedText(sim.years_gained)}</h2>
                  <p>First flood {floodYearText(sim.before.flood_year)} → <b>{floodYearText(sim.after.flood_year)}</b> · risk {sim.before.risk_score} → <b>{sim.after.risk_score}</b> · next step: {sim.after.action}</p>
                </div>
              )}
              {table && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead><tr><th>Raise</th><th>First flooded</th><th>Gain</th><th>Risk {year}</th></tr></thead>
                    <tbody>
                      {table.map((r) => (
                        <tr key={r.h}><td><b>{r.h} m</b></td><td>{floodYearText(r.after.flood_year)}</td><td>{gainedText(r.years_gained)}</td>
                          <td><RiskBadge level={r.after.risk_level} /> {r.after.risk_score}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="chart-source">The smallest raise that reaches "safe beyond 2150" is usually the most cost-effective. Raising fixes flooding only; heat and salt need cooling and insulator work.</p>
                </div>
              )}
            </Panel>

            <Panel title="In plain words" subtitle={`${year}, ${scenarioOf(scenario).label}, ${surgeOf(surge).label}`}>
              <ul className="explain-list">{explain(p, row, { year, scenario, surge, model }).map((l, i) => <li key={i}>{l}</li>)}</ul>
              <div className="action-box"><span>RECOMMENDED ACTION</span><b>{row.action}</b></div>
              <h3 className="side-title">Why this score?</h3>
              <ScoreBar label="Flood danger (60%)" value={row.flood_score} color={RISK_COLORS[band(row.flood_score, model)]} hint="1 = water at or above the equipment base; 0 = 2 m or more to spare" />
              <ScoreBar label="Heat stress (20%)" value={row.heat_score} color={RISK_COLORS[band(row.heat_score, model)]} hint="Higher near the sea, scaled by marine-heatwave days and humidity" />
              <ScoreBar label="Salt corrosion (20%)" value={row.salt_score} color={RISK_COLORS[band(row.salt_score, model)]} hint="Highest within ~3 km of the shore, scaled by how often wind blows from the sea" />
              <ScoreBar label="Importance" value={p.criticality} color="#a78bfa" hint="Voltage level (80%) + hospitals within 3 km (20%): raises the final score by up to 40%" />
              <div className="formula-note">Risk = (0.6 × flood + 0.2 × heat + 0.2 × salt) × (0.6 + 0.4 × importance) = <b>{row.risk_score}</b></div>
            </Panel>
          </div>

          <Panel title="Flood timeline" subtitle="Storm water level each decade vs. the equipment base">
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 20, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#26374b" strokeDasharray="4 4" />
                  <XAxis dataKey="year" stroke="#8294a9" />
                  <YAxis stroke="#8294a9" unit=" m" domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => [`${v} m`, "Storm water level"]} contentStyle={TOOLTIP_STYLE} />
                  <ReferenceLine y={p.base_elev_m} stroke="#fb7185" strokeDasharray="6 4" label={{ value: `Equipment base ${p.base_elev_m} m`, fill: "#fb7185", position: "insideTopLeft", fontSize: 11 }} />
                  <ReferenceLine x={viewYear} stroke="#2dd4bf" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="water" stroke="#38bdf8" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="scenario-compare">
              {SCENARIOS.map((s) => (
                <div key={s.id} className={s.id === scenario ? "on" : ""}>
                  <small>{s.label}: first flooded</small><b>{floodYearText(byScenario[s.id]?.timeline?.[0]?.flood_year)}</b>
                </div>
              ))}
            </div>
          </Panel>

          {/* Printed one-page site card */}
          <section className="print-area print-only">
            <p className="eyebrow">COASTGRID TWIN · SITE CARD</p>
            <h2>{p.name}</h2>
            <p>{typeLabel(p.type)}{p.voltage_kv ? `, ${p.voltage_kv} kV` : ""} · {regionInfo?.name} · {coords?.[1].toFixed(5)}, {coords?.[0].toFixed(5)}</p>
            <p>Scenario: {scenarioOf(scenario).label}, {surgeOf(surge).label}, year {year}. Priority #{rank?.rank} of {priorities.length}; plan phase: {phase?.label} ({phase?.when}).</p>
            <h3>Key facts</h3>
            <p>Ground {p.ground_elev_m} m · equipment base {p.base_elev_m} m (assumed) · {p.dist_coast_km} km from sea · first flooded {floodYearText(row.flood_year)} · risk {row.risk_score} ({row.risk_level})</p>
            <h3>Explanation</h3>
            <ul>{explain(p, row, { year, scenario, surge, model }).map((l, i) => <li key={i}>{l}</li>)}</ul>
            <h3>Recommended action</h3>
            <p><b>{row.action}</b></p>
            <h3>Field checks</h3>
            <ul><li>Measure the real plinth height and enter it in the asset register</li><li>Record past flood marks</li><li>Note drainage around the site</li></ul>
          </section>
        </>
      )}
      {!p && !error && <p className="empty-message">Loading site…</p>}
    </div>
  );
}
