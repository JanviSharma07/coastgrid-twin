import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { Download, IndianRupee, Printer, Search } from "lucide-react";
import { InfoBox, Panel, RiskBadge } from "../components/ui";
import {
  ACTION_GROUPS, PRIORITY_COLUMNS, PHASES, actionGroup, downloadText, floodYearText, phaseOf, toCSV, typeLabel, storage,
  scenarioOf, surgeOf, TOOLTIP_STYLE,
} from "../lib/utils";

const COSTED = ACTION_GROUPS.filter((g) => !["plan", "monitor"].includes(g.id));
const STATUSES = ["Not started", "Approved", "In progress", "Done"];

const FUNDING = [
  ["Act now / capital plan", "Revamped Distribution Sector Scheme (RDSS, Ministry of Power) for distribution strengthening; state capital-investment plan approved by the State Electricity Regulatory Commission."],
  ["Disaster-resilience works", "National / State Disaster Mitigation Funds (NDMF / SDMF) for mitigation projects in hazard-prone areas."],
  ["Long-term relocation & new solar + battery", "Multilateral climate finance (e.g. World Bank, ADB, Green Climate Fund) and renewable-energy programmes."],
  ["Maintenance", "Utility operations & maintenance budget (recovered through regulator-approved tariffs)."],
];

export default function InvestmentPlan({ priorities, region, regionInfo, scenario, year, surge, go }) {
  const [budget, setBudget] = useState(() => storage.get("cg-budget", ""));
  const [costs, setCosts] = useState(() => storage.get("cg-costs", {}));
  const [status, setStatus] = useState(() => storage.get(`cg-status-${region}`, {}));
  const [query, setQuery] = useState("");

  useEffect(() => storage.set("cg-budget", budget), [budget]);
  useEffect(() => storage.set("cg-costs", costs), [costs]);
  useEffect(() => setStatus(storage.get(`cg-status-${region}`, {})), [region]);
  const setOne = (id, v) => {
    const next = { ...status, [id]: v };
    setStatus(next);
    storage.set(`cg-status-${region}`, next);
  };

  const withPhase = useMemo(() => priorities.map((r) => ({ ...r, phase: phaseOf(r) })), [priorities]);
  const byPhase = useMemo(() => {
    const m = Object.fromEntries(PHASES.map((p) => [p.id, []]));
    withPhase.forEach((r) => m[r.phase].push(r));
    return m;
  }, [withPhase]);

  const decades = useMemo(() => {
    const m = {};
    priorities.forEach((r) => {
      if (r.flood_year) {
        const d = Math.floor(r.flood_year / 10) * 10;
        m[d] = (m[d] || 0) + 1;
      }
    });
    return Object.entries(m).map(([d, n]) => ({ decade: `${d}s`, start: Number(d), count: n })).sort((a, b) => a.start - b.start);
  }, [priorities]);

  const plan = useMemo(() => {
    const total = parseFloat(budget);
    const groupCount = {};
    priorities.forEach((r) => (groupCount[actionGroup(r.action)] = (groupCount[actionGroup(r.action)] || 0) + 1));
    if (!(total > 0)) return { groupCount, ready: false };
    let left = total;
    const funded = [], unfunded = [];
    let uncosted = 0;
    priorities.forEach((r) => {
      const g = actionGroup(r.action);
      if (g === "plan" || g === "monitor") return;
      const c = parseFloat(costs[g]);
      if (!(c > 0)) return void uncosted++;
      if (c <= left) {
        left -= c;
        funded.push({ ...r, cost: c });
      } else unfunded.push({ ...r, cost: c });
    });
    const needed = funded.concat(unfunded).reduce((s, r) => s + r.cost, 0);
    return { groupCount, ready: true, funded, unfunded, left, used: total - left, uncosted, needed };
  }, [priorities, budget, costs]);

  const tracked = withPhase.filter((r) => ["now", "capital", "maintain"].includes(r.phase));
  const shown = tracked.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));
  const doneCount = tracked.filter((r) => status[r.id] === "Done").length;
  const fmt = (v) => (Math.round(v * 100) / 100).toLocaleString("en-IN");
  const exportCSV = () => downloadText(`coastgrid_plan_${region}_${scenario}_${year}_surge${surge}.csv`,
    toCSV(withPhase.map((r) => ({ ...r, phaseLabel: PHASES.find((p) => p.id === r.phase).label, status: status[r.id] || "Not started" })),
      [...PRIORITY_COLUMNS, { label: "Plan phase", get: (r) => r.phaseLabel }, { label: "Status", get: (r) => r.status }]));

  return (
    <div className="page">
      <InfoBox steps={["Read the five phases: how many sites fall in each.", "Enter your own unit costs and budget to see what is covered.", "Track each job's status as field work progresses."]}>
        The planning head's screen. Every site is ranked and placed in a <b>spending phase</b> based on when the sea
        reaches it and what it needs. The utility enters its own costs (we never invent prices); the plan then shows
        what the budget covers, which funding route fits, and how execution is going.
      </InfoBox>

      <Panel title="The plan in five phases" subtitle={`${regionInfo?.short} · ${scenarioOf(scenario).label} · ${year} · ${surgeOf(surge).label}`}
        right={<div className="btn-row"><button className="link-button" onClick={exportCSV} disabled={!priorities.length}><Download size={15} /> CSV</button>
          <button className="link-button" onClick={() => window.print()}><Printer size={15} /> Print plan</button></div>}>
        <div className="phase-board">
          {PHASES.map((ph) => (
            <div key={ph.id} className="phase-col" style={{ borderTopColor: ph.color }}>
              <div className="phase-head"><b style={{ color: ph.color }}>{byPhase[ph.id]?.length || 0}</b><span>{ph.label}</span><small>{ph.when}</small></div>
              <p>{ph.what}</p>
              {(byPhase[ph.id] || []).slice(0, 4).map((r) => (
                <button key={r.id} onClick={() => go("asset", r.id)}>#{r.rank} {r.name}<small>floods {floodYearText(r.flood_year)}</small></button>
              ))}
              {(byPhase[ph.id]?.length || 0) > 4 && <small className="more">+{byPhase[ph.id].length - 4} more</small>}
            </div>
          ))}
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="Where the sites fall" subtitle="Share of all sites in each phase">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={PHASES.map((ph) => ({ name: ph.label, value: byPhase[ph.id]?.length || 0, color: ph.color })).filter((d) => d.value)}
                  dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                  {PHASES.filter((ph) => byPhase[ph.id]?.length).map((ph) => <Cell key={ph.id} fill={ph.color} stroke="#0c202a" />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="What kind of work is needed" subtitle="Number of sites per recommended action">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart layout="vertical" data={ACTION_GROUPS.map((g) => ({ name: g.label, n: plan.groupCount[g.id] || 0 })).filter((d) => d.n)} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                <XAxis type="number" stroke="#8294a9" fontSize={10} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="#8294a9" fontSize={10} width={170} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="n" name="sites" fill="#2dd4bf" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="two-col">
        <Panel title="Budget: what does our money cover?" subtitle="Your numbers, in ₹ crore" right={<IndianRupee size={18} color="#2dd4bf" />}>
          <label className="field-label">Total budget available (₹ crore)</label>
          <input className="money-input" type="number" min="0" step="any" placeholder="your approved amount" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <label className="field-label">Unit cost per site for each action (₹ crore)</label>
          {COSTED.map((g) => (
            <div className="cost-row" key={g.id}>
              <span>{g.label} <small>({plan.groupCount[g.id] || 0} sites)</small></span>
              <input type="number" min="0" step="any" placeholder="cost" value={costs[g.id] ?? ""} onChange={(e) => setCosts({ ...costs, [g.id]: e.target.value })} aria-label={`Cost for ${g.label}`} />
            </div>
          ))}
          {plan.ready ? (
            <div className="budget-result">
              <div><span>Sites funded</span><b>{plan.funded.length}</b></div>
              <div><span>Total need</span><b>₹{fmt(plan.needed)} cr</b></div>
              <div><span>Used</span><b>₹{fmt(plan.used)} cr</b></div>
              <div><span>Funding gap</span><b>₹{fmt(Math.max(plan.needed - plan.used, 0))} cr</b></div>
              {plan.uncosted > 0 && <p className="side-hint">{plan.uncosted} sites skipped: no cost entered for their action.</p>}
              {plan.funded.length > 0 && <p className="side-hint">Funded in rank order: {plan.funded.slice(0, 6).map((r) => r.name).join(", ")}{plan.funded.length > 6 ? "…" : ""}</p>}
            </div>
          ) : <p className="empty-message">Enter a budget and at least one unit cost.</p>}
          <p className="reference-note">
            For scale: after Cyclone Michaung (Dec 2023), TANGEDCO sought about ₹700 crore to protect its Chennai
            infrastructure from floods (<a href="https://www.dtnext.in/news/chennai/cyclone-michaung-tangedco-seeks-rs-700-cr-to-protect-infra-from-floods" target="_blank" rel="noreferrer">DT Next</a>).
          </p>
        </Panel>

        <Panel title="When is the money needed?" subtitle="Sites whose equipment first floods in each decade">
          {decades.length ? (
            <div style={{ width: "100%", height: 230 }}>
              <ResponsiveContainer>
                <BarChart data={decades} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#26374b" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="decade" stroke="#8294a9" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="#8294a9" />
                  <Tooltip formatter={(v) => [v, "sites first flood"]} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {decades.map((d) => <Cell key={d.decade} fill={d.start < 2030 ? "#fb7185" : d.start < 2050 ? "#fbbf24" : "#38bdf8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="empty-message">No site floods before 2150 in this future.</p>}
          <h3 className="side-title">Who can pay for what</h3>
          <ul className="funding-list">
            {FUNDING.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}
          </ul>
          <p className="chart-source">Possible routes to discuss with the state; eligibility depends on each scheme's guidelines.</p>
        </Panel>
      </div>

      <Panel title="Execution tracker" subtitle={`${doneCount} of ${tracked.length} jobs done · status saved in this browser (a shared database comes with adoption)`}>
        <div className="progress"><div style={{ width: `${tracked.length ? (doneCount / tracked.length) * 100 : 0}%` }} /></div>
        <div className="table-tools">
          <label className="search-box"><Search size={14} /><input placeholder="Find a site…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a site" /></label>
        </div>
        <div className="table-wrap tall">
          <table className="data-table">
            <thead><tr><th>#</th><th>Site</th><th>Phase</th><th>Risk</th><th>Floods</th><th>Action</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const ph = PHASES.find((p) => p.id === r.phase);
                return (
                  <tr key={r.id}>
                    <td>{r.rank}</td>
                    <td><button className="text-link" onClick={() => go("asset", r.id)}>{r.name}</button><small>{typeLabel(r.type)}{r.voltage_kv ? ` · ${r.voltage_kv} kV` : ""}</small></td>
                    <td><span className="phase-tag" style={{ color: ph.color, borderColor: ph.color }}>{ph.label}</span></td>
                    <td><RiskBadge level={r.risk_level} /> {r.risk_score}</td>
                    <td>{floodYearText(r.flood_year)}</td>
                    <td>{r.action}</td>
                    <td>
                      <select className={`status-select s${STATUSES.indexOf(status[r.id] || "Not started")}`} value={status[r.id] || "Not started"} onChange={(e) => setOne(r.id, e.target.value)} aria-label={`Status of ${r.name}`}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && <p className="empty-message">No sites need spending in this future.</p>}
        </div>
      </Panel>

      <section className="print-area print-only">
        <p className="eyebrow">COASTGRID TWIN · INVESTMENT PLAN</p>
        <h2>{regionInfo?.name} power grid</h2>
        <p>{scenarioOf(scenario).label} · year {year} · {surgeOf(surge).label} · generated {new Date().toLocaleDateString("en-IN")}</p>
        {PHASES.map((ph) => (
          <div key={ph.id}>
            <h3>{ph.label} ({ph.when}): {byPhase[ph.id]?.length || 0} sites</h3>
            <p>{ph.what}</p>
            <ul>{(byPhase[ph.id] || []).slice(0, 12).map((r) => <li key={r.id}>#{r.rank} {r.name}: floods {floodYearText(r.flood_year)}; {r.action}</li>)}</ul>
          </div>
        ))}
        {plan.ready && <p>Budget ₹{fmt(parseFloat(budget))} cr covers {plan.funded.length} sites; total need ₹{fmt(plan.needed)} cr.</p>}
        <p>Screening-level results; confirm with site surveys.</p>
      </section>
    </div>
  );
}
