import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ArrowRight, MapPin } from "lucide-react";
import { getAssetDetail } from "../services/api";
import { InfoBox, Panel, ScoreBar, RiskBadge } from "../components/ui";
import AssetMap from "../components/AssetMap";
import { SCENARIOS, RISK_COLORS, band, floodYearText, scenarioOf, surgeOf, typeLabel } from "../lib/utils";

function explain(p, r, { year, scenario, surge, model }) {
  const lines = [];
  lines.push(
    `This ${typeLabel(p.type).toLowerCase()}${p.voltage_kv ? ` (${p.voltage_kv} kV)` : ""} stands on ground about ${p.ground_elev_m} m above sea level, ${p.dist_coast_km} km from the sea. ` +
      `We assume its equipment sits on a ${(p.base_elev_m - p.ground_elev_m).toFixed(1)} m plinth, so the equipment base is at ${p.base_elev_m} m (a utility can replace this with the real height).`
  );
  const m = r.margin_m;
  lines.push(
    `In ${year}, if ${scenarioOf(scenario).plain}, ${surgeOf(surge).short} would push sea water up to ${r.water_level_m} m. ` +
      (m < 0
        ? `That is ${Math.abs(m).toFixed(2)} m ABOVE the equipment base: the asset would be flooded.`
        : `That leaves only ${m.toFixed(2)} m of safety margin below the equipment base.`)
  );
  lines.push(
    r.flood_year
      ? `Water first reaches the equipment base around ${r.flood_year} in this storm scenario.`
      : `Water stays below the equipment base until at least 2150 in this storm scenario.`
  );
  if (p.subsidence_mm_yr > 0)
    lines.push(`The ground here is also sinking by about ${p.subsidence_mm_yr} mm every year, which brings the flood date closer.`);
  lines.push(
    `Being ${p.dist_coast_km} km from the shore, it has ${band(r.heat_score, model)} heat stress (${r.heat_score}) and ${band(r.salt_score, model)} salt-corrosion stress (${r.salt_score}).`
  );
  lines.push(
    `${p.hospitals_nearby || 0} hospital(s) lie within 3 km and its voltage level gives it an importance (criticality) of ${p.criticality}. More important assets are ranked higher.`
  );
  return lines;
}

export default function AssetDetails(props) {
  const { priorities, assets, selectedId, setSelectedId, scenario, year, surge, model, region, floodZones, go } = props;
  const [detail, setDetail] = useState(null);
  const [byScenario, setByScenario] = useState({});
  const [error, setError] = useState("");

  const id = selectedId || priorities[0]?.id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setError("");
    Promise.all(SCENARIOS.map((s) => getAssetDetail(id, { scenario: s.id, surge }).then((r) => [s.id, r.data])))
      .then((pairs) => {
        if (cancelled) return;
        const map = Object.fromEntries(pairs);
        setByScenario(map);
        setDetail(map[scenario]);
      })
      .catch(() => !cancelled && setError("Could not load this asset. Please try again."));
    return () => {
      cancelled = true;
    };
  }, [id, surge, scenario]);

  const props0 = detail?.asset?.properties;
  const row = useMemo(() => detail?.timeline?.find((t) => t.year === year), [detail, year]);
  const chartData = useMemo(
    () => (detail?.timeline || []).map((t) => ({ year: t.year, water: t.water_level_m })),
    [detail]
  );
  const coords = detail?.asset?.geometry?.coordinates;
  const lon = coords?.[0];
  const lat = coords?.[1];
  const focus = useMemo(() => (lat !== undefined ? [lat, lon] : null), [lat, lon]);

  return (
    <div className="page">
      <InfoBox steps={["Pick an asset below (or click one on any map).", "Read the plain-words explanation.", "Press “Test a fix” to try raising it in the What-If Simulator."]}>
        Everything about one power asset: when sea water first reaches its equipment, how heat and salt wear it down,
        how important it is, and the overall 0–1 risk score that ranks it.
      </InfoBox>

      <Panel>
        <label className="field-label" htmlFor="asset-select">Choose an asset (sorted from highest risk)</label>
        <select id="asset-select" className="wide-select" value={id || ""} onChange={(e) => setSelectedId(e.target.value)}>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.rank} · {p.name} · {p.risk_level} ({p.risk_score})
            </option>
          ))}
        </select>
      </Panel>

      {error && <div className="error-banner">{error}</div>}

      {props0 && row && (
        <>
          <section className="asset-head">
            <div>
              <p className="eyebrow">{typeLabel(props0.type).toUpperCase()}{props0.voltage_kv ? ` · ${props0.voltage_kv} kV` : ""}</p>
              <h2>{props0.name} <RiskBadge level={row.risk_level} /></h2>
              <p className="muted"><MapPin size={13} /> {coords?.[1].toFixed(4)}, {coords?.[0].toFixed(4)} · data: {props0.source}</p>
            </div>
            <div className="big-number">
              <span>First flooded</span>
              <b style={{ color: row.flood_year ? RISK_COLORS.high : RISK_COLORS.low }}>{floodYearText(row.flood_year)}</b>
              <small>{surgeOf(surge).label}</small>
            </div>
            <div className="big-number">
              <span>Risk score {year}</span>
              <b style={{ color: RISK_COLORS[row.risk_level] }}>{row.risk_score}</b>
              <small>0 = safe · 1 = worst</small>
            </div>
          </section>

          <div className="two-col">
            <Panel title="In plain words" subtitle={`${year}, ${scenarioOf(scenario).label}, ${surgeOf(surge).label}`}>
              <ul className="explain-list">
                {explain(props0, row, { year, scenario, surge, model }).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <div className="action-box">
                <span>RECOMMENDED ACTION</span>
                <b>{row.action}</b>
              </div>
              <button className="primary-button" onClick={() => go("whatif", id)}>
                Test a fix in the What-If Simulator <ArrowRight size={16} />
              </button>
            </Panel>

            <Panel title="Why this score?" subtitle="Each danger scored 0–1, then combined">
              <ScoreBar label="Flood danger (60% weight)" value={row.flood_score} color={RISK_COLORS[band(row.flood_score, model)]}
                hint="1 = water at or above the equipment base; falls as the safety margin grows to 2 m" />
              <ScoreBar label="Heat stress (20%)" value={row.heat_score} color={RISK_COLORS[band(row.heat_score, model)]}
                hint="Higher near the sea, scaled by marine-heatwave days and humidity" />
              <ScoreBar label="Salt corrosion (20%)" value={row.salt_score} color={RISK_COLORS[band(row.salt_score, model)]}
                hint="Highest within ~3 km of the shore, scaled by how often wind blows from the sea" />
              <ScoreBar label="Importance / criticality" value={props0.criticality} color="#a78bfa"
                hint="Voltage level (80%) + hospitals within 3 km (20%). Raises the final score by up to 40%" />
              <div className="formula-note">
                Risk = (0.6 × flood + 0.2 × heat + 0.2 × salt) × (0.6 + 0.4 × importance) = <b>{row.risk_score}</b>
              </div>
            </Panel>
          </div>

          <div className="two-col">
            <Panel title="Flood timeline" subtitle="Highest storm water level each decade vs. this asset's equipment base">
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 20, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="#26374b" strokeDasharray="4 4" />
                    <XAxis dataKey="year" stroke="#8294a9" />
                    <YAxis stroke="#8294a9" unit=" m" domain={["auto", "auto"]} />
                    <Tooltip formatter={(v) => [`${v} m`, "Storm water level"]}
                      contentStyle={{ background: "#101e30", border: "1px solid #30445c", borderRadius: 10, color: "#fff" }} />
                    <ReferenceLine y={props0.base_elev_m} stroke="#fb7185" strokeDasharray="6 4"
                      label={{ value: `Equipment base ${props0.base_elev_m} m`, fill: "#fb7185", position: "insideTopLeft", fontSize: 11 }} />
                    <ReferenceLine x={year} stroke="#2dd4bf" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="water" stroke="#38bdf8" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-source">When the blue line crosses the red line, the equipment floods. Water level = sea-level rise + land sinking + storm surge.</p>
              <div className="scenario-compare">
                {SCENARIOS.map((s) => {
                  const fy = byScenario[s.id]?.timeline?.[0]?.flood_year;
                  return (
                    <div key={s.id} className={s.id === scenario ? "on" : ""}>
                      <small>{s.label}</small>
                      <b>{floodYearText(fy)}</b>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Where it is" subtitle="Flooded land shown for the chosen future">
              <AssetMap assets={assets} floodZones={floodZones} model={model} selectedId={id}
                layers={{ assets: true, flood: true, safe: false, sinking: false }}
                layerKey={`a-${scenario}-${year}-${surge}`}
                center={focus || region?.center} zoom={13} height={330} focus={focus}
                onSelect={setSelectedId} />
            </Panel>
          </div>
        </>
      )}

      {!props0 && !error && <p className="empty-message">Loading asset…</p>}
    </div>
  );
}
