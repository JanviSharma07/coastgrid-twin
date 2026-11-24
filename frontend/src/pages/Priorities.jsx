import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Download, IndianRupee, ArrowUpDown } from "lucide-react";
import { InfoBox, Panel, RiskBadge } from "../components/ui";
import {
  ACTION_GROUPS, PRIORITY_COLUMNS, actionGroup, downloadText, floodYearText, toCSV, typeLabel, storage, scenarioOf, surgeOf,
} from "../lib/utils";

const SORTS = {
  rank: { label: "Rank", get: (r) => r.rank },
  risk: { label: "Risk", get: (r) => -r.risk_score },
  flood: { label: "First flooded", get: (r) => r.flood_year ?? 9999 },
  margin: { label: "Safety margin", get: (r) => r.margin_m },
};

const COSTED = ACTION_GROUPS.filter((g) => !["plan", "monitor"].includes(g.id));

export default function Priorities({ priorities, scenario, year, surge, go }) {
  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("rank");
  const [budget, setBudget] = useState(() => storage.get("cg-budget", ""));
  const [costs, setCosts] = useState(() => storage.get("cg-costs", {}));

  useEffect(() => storage.set("cg-budget", budget), [budget]);
  useEffect(() => storage.set("cg-costs", costs), [costs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return priorities
      .filter((r) => (level === "all" ? true : r.risk_level === level))
      .filter((r) => (!q ? true : r.name.toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => SORTS[sort].get(a) - SORTS[sort].get(b));
  }, [priorities, level, query, sort]);

  // When will money be needed: assets grouped by the decade they first flood
  const decades = useMemo(() => {
    const m = {};
    priorities.forEach((r) => {
      if (r.flood_year) {
        const d = Math.floor(r.flood_year / 10) * 10;
        m[d] = (m[d] || 0) + 1;
      }
    });
    return Object.entries(m)
      .map(([d, n]) => ({ decade: `${d}s`, start: Number(d), count: n }))
      .sort((a, b) => a.start - b.start);
  }, [priorities]);
  const neverFlood = priorities.filter((r) => !r.flood_year).length;

  // Budget planner: go down the ranked list and fund each costed action that still fits
  const plan = useMemo(() => {
    const total = parseFloat(budget);
    const groupCount = {};
    priorities.forEach((r) => {
      const g = actionGroup(r.action);
      groupCount[g] = (groupCount[g] || 0) + 1;
    });
    if (!(total > 0)) return { groupCount, ready: false };
    let left = total;
    const funded = [];
    const unfunded = [];
    let uncosted = 0;
    priorities.forEach((r) => {
      const g = actionGroup(r.action);
      if (g === "plan" || g === "monitor") return;
      const c = parseFloat(costs[g]);
      if (!(c > 0)) {
        uncosted++;
        return;
      }
      if (c <= left) {
        left -= c;
        funded.push({ ...r, cost: c });
      } else unfunded.push({ ...r, cost: c });
    });
    return { groupCount, ready: true, funded, unfunded, left, used: total - left, uncosted };
  }, [priorities, budget, costs]);

  const exportCSV = () =>
    downloadText(`coastgrid_priorities_${scenario}_${year}_surge${surge}.csv`, toCSV(priorities, PRIORITY_COLUMNS));

  const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString("en-IN");

  return (
    <div className="page">
      <InfoBox steps={[
        "Use the table to see every asset in order of urgency (click a row to open it).",
        "Check “When will money be needed” to plan spending by decade.",
        "Type your own cost estimates into the budget planner to see what your budget covers.",
      ]}>
        This is the to-do list for the utility: every asset ranked by its risk score, the recommended action, and the
        year it first floods. The budget planner does the money maths for you, using <b>your</b> cost estimates
        (we don't invent prices).
      </InfoBox>

      <Panel title="Priority action list" subtitle={`${priorities.length} assets · ${scenarioOf(scenario).label} · ${year} · ${surgeOf(surge).label}`}
        right={<button className="link-button" onClick={exportCSV} disabled={!priorities.length}><Download size={15} /> Download CSV</button>}>
        <div className="table-tools">
          <input placeholder="Search by name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search assets" />
          <div className="segmented">
            {["all", "high", "medium", "low"].map((l) => (
              <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>{l}</button>
            ))}
          </div>
          <label className="sort-select">
            <ArrowUpDown size={14} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v.label}</option>)}
            </select>
          </label>
        </div>
        <div className="table-wrap tall">
          <table className="data-table clickable">
            <thead>
              <tr><th>#</th><th>Asset</th><th>Risk</th><th>First flooded</th><th>Margin</th><th>Main threat</th><th>Recommended action</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => go("asset", r.id)}>
                  <td>{r.rank}</td>
                  <td><b>{r.name}</b><small>{typeLabel(r.type)}{r.voltage_kv ? ` · ${r.voltage_kv} kV` : ""}</small></td>
                  <td><RiskBadge level={r.risk_level} /> {r.risk_score}</td>
                  <td>{floodYearText(r.flood_year)}</td>
                  <td className={r.margin_m < 0 ? "neg" : ""}>{r.margin_m} m</td>
                  <td>{r.main_threat}</td>
                  <td>{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="empty-message">No assets match.</p>}
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="When will money be needed?" subtitle="Number of assets whose equipment first floods in each decade (this emissions path + storm)">
          {decades.length ? (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={decades} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#26374b" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="decade" stroke="#8294a9" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="#8294a9" />
                  <Tooltip formatter={(v) => [v, "assets first flood"]}
                    contentStyle={{ background: "#101e30", border: "1px solid #30445c", borderRadius: 10, color: "#fff" }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {decades.map((d) => <Cell key={d.decade} fill={d.start < 2050 ? "#fb7185" : d.start < 2080 ? "#fbbf24" : "#38bdf8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="empty-message">No asset floods before 2150 in this scenario.</p>
          )}
          <p className="chart-source">
            Red bars (before 2050) belong in the current 5-year capital plan; amber (2050–2079) in long-term planning.
            {neverFlood ? ` ${neverFlood} assets stay dry until at least 2150.` : ""}
          </p>
        </Panel>

        <Panel title="Budget planner" subtitle="Enter your own numbers in ₹ crore" right={<IndianRupee size={18} color="#2dd4bf" />}>
          <label className="field-label">Total budget available (₹ crore)</label>
          <input className="money-input" type="number" min="0" step="any" placeholder="e.g. your approved amount"
            value={budget} onChange={(e) => setBudget(e.target.value)} />
          <label className="field-label">Cost per asset for each action (₹ crore)</label>
          {COSTED.map((g) => (
            <div className="cost-row" key={g.id}>
              <span>{g.label} <small>({plan.groupCount[g.id] || 0} assets)</small></span>
              <input type="number" min="0" step="any" placeholder="cost" value={costs[g.id] ?? ""}
                onChange={(e) => setCosts({ ...costs, [g.id]: e.target.value })} aria-label={`Cost for ${g.label}`} />
            </div>
          ))}
          <p className="side-hint">
            "Plan elevation in next upgrade" ({plan.groupCount.plan || 0}) and "Monitor" ({plan.groupCount.monitor || 0}) need no extra money now.
          </p>

          {plan.ready ? (
            <div className="budget-result">
              <div><span>Assets funded</span><b>{plan.funded.length}</b></div>
              <div><span>Money used</span><b>₹{fmt(plan.used)} cr</b></div>
              <div><span>Left over</span><b>₹{fmt(plan.left)} cr</b></div>
              <div><span>Not covered</span><b>{plan.unfunded.length}</b></div>
              {plan.uncosted > 0 && <p className="side-hint">{plan.uncosted} assets skipped because their action has no cost entered.</p>}
              {plan.funded.length > 0 && (
                <p className="side-hint">Funded in rank order: {plan.funded.slice(0, 8).map((r) => r.name).join(", ")}{plan.funded.length > 8 ? "…" : ""}</p>
              )}
            </div>
          ) : (
            <p className="empty-message">Enter a total budget and at least one cost to see what it covers.</p>
          )}
          <p className="reference-note">
            For scale: after Cyclone Michaung (Dec 2023), TANGEDCO sought about ₹700 crore to protect its Chennai
            infrastructure from floods (<a href="https://www.dtnext.in/news/chennai/cyclone-michaung-tangedco-seeks-rs-700-cr-to-protect-infra-from-floods" target="_blank" rel="noreferrer">DT Next</a>).
          </p>
        </Panel>
      </div>
    </div>
  );
}
