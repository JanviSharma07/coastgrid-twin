import { useState } from "react";
import { ArrowUp, LoaderCircle, Table2, ArrowRight } from "lucide-react";
import { simulateRisk } from "../services/api";
import { InfoBox, Panel, RiskBadge } from "../components/ui";
import { floodYearText } from "../lib/utils";

const HEIGHTS = [0.5, 1, 1.5, 2, 3];

const gainedText = (g) => (g === null || g === undefined ? "No flood risk to fix" : g === "beyond 2150" ? "Safe beyond 2150" : `+${g} years`);

export default function WhatIf({ priorities, selectedId, setSelectedId, scenario, year, surge, go }) {
  const [raise, setRaise] = useState(1.5);
  const [result, setResult] = useState(null);
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const id = selectedId || priorities[0]?.id;
  const body = (r) => ({ asset_id: id, scenario, year: Number(year), raise_m: r, surge: Number(surge) });

  const run = async () => {
    setLoading("one");
    setError("");
    setResult(null);
    try {
      setResult((await simulateRisk(body(raise))).data);
    } catch (e) {
      setError(e.response?.data?.detail?.toString() || "Simulation failed. Check the server connection.");
    } finally {
      setLoading("");
    }
  };

  const compare = async () => {
    setLoading("table");
    setError("");
    try {
      const res = await Promise.all(HEIGHTS.map((h) => simulateRisk(body(h)).then((r) => ({ h, ...r.data }))));
      setTable(res);
    } catch {
      setError("Comparison failed. Check the server connection.");
    } finally {
      setLoading("");
    }
  };

  const pick = (v) => {
    setSelectedId(v);
    setResult(null);
    setTable(null);
  };

  return (
    <div className="page">
      <InfoBox steps={["Pick an asset (highest risk first).", "Move the slider to choose how many metres to raise its equipment.", "Press Run, or compare several heights at once."]}>
        Before spending crores on an upgrade, test it here. "Raising" means lifting the transformer and switchgear onto a
        higher plinth or platform (or moving them to higher ground). The simulator re-runs our flood model for that asset
        and tells you how many extra years of safety the upgrade buys.
      </InfoBox>

      <div className="two-col">
        <Panel title="Raise an asset and see what changes">
          <div className="simulator">
            <label htmlFor="whatif-asset">Asset</label>
            <select id="whatif-asset" value={id || ""} onChange={(e) => pick(e.target.value)}>
              {priorities.map((p) => (
                <option key={p.id} value={p.id}>#{p.rank} · {p.name} · {p.risk_level} ({p.risk_score})</option>
              ))}
            </select>

            <div className="slider-heading">
              <label>Raise equipment base by</label>
              <strong>{raise.toFixed(1)} m</strong>
            </div>
            <input type="range" min="0" max="5" step="0.5" value={raise} onChange={(e) => setRaise(Number(e.target.value))} aria-label="Raise height in metres" />
            <div className="slider-labels"><span>0 m</span><span>5 m</span></div>

            <button className="primary-button" onClick={run} disabled={!!loading || !id}>
              {loading === "one" ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={18} />}
              {loading === "one" ? "Running…" : "Run simulation"}
            </button>
            {error && <p className="error-message">{error}</p>}

            {result && (
              <div className="simulation-result">
                <span>RESULT · {result.name}</span>
                <h2>{gainedText(result.years_gained)}</h2>
                <p>
                  <b>Without the upgrade</b>, water first reaches the equipment in <b>{floodYearText(result.before.flood_year)}</b>.{" "}
                  <b>Raised by {raise} m</b>, that moves to <b>{floodYearText(result.after.flood_year)}</b>.
                </p>
                <p>
                  Risk in {result.year}: <RiskBadge level={result.before.risk_level} /> {result.before.risk_score} →{" "}
                  <RiskBadge level={result.after.risk_level} /> {result.after.risk_score}
                </p>
                <p>Recommended next step: <b>{result.after.action}</b></p>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Compare heights" subtitle="Find the smallest raise that keeps the asset safe"
          right={<button className="link-button" onClick={compare} disabled={!!loading || !id}>
            {loading === "table" ? <LoaderCircle className="spin" size={15} /> : <Table2 size={15} />} Compare 0.5–3 m
          </button>}>
          {table ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Raise</th><th>First flooded</th><th>Years gained</th><th>Risk {year}</th></tr></thead>
                <tbody>
                  <tr className="muted-row"><td>none</td><td>{floodYearText(table[0].before.flood_year)}</td><td>–</td><td><RiskBadge level={table[0].before.risk_level} /> {table[0].before.risk_score}</td></tr>
                  {table.map((r) => (
                    <tr key={r.h}>
                      <td><b>{r.h} m</b></td>
                      <td>{floodYearText(r.after.flood_year)}</td>
                      <td>{gainedText(r.years_gained)}</td>
                      <td><RiskBadge level={r.after.risk_level} /> {r.after.risk_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-message">Press “Compare” to run the model for five heights at once.</p>
          )}
          <p className="chart-source">
            Raising only fixes flooding. Heat and salt stress need different fixes (cooling, polymer insulators,
            washing), so the risk score may not drop to zero.
          </p>
          <button className="link-button" onClick={() => go("priorities")}>See what your budget covers <ArrowRight size={14} /></button>
        </Panel>
      </div>
    </div>
  );
}
