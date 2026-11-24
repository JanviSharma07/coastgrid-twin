import { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { SCENARIOS, YEARS, SURGES, scenarioOf, surgeOf } from "../lib/utils";

// "What this page tells you" box shown at the top of every page.
export function InfoBox({ title = "What this page tells you", children, steps }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="info-box">
      <button className="info-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Info size={17} />
        <strong>{title}</strong>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="info-body">
          <div>{children}</div>
          {steps && (
            <ol className="info-steps">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// The three "what future are we testing?" controls, with plain-language hints.
export function Controls({ scenario, setScenario, year, setYear, surge, setSurge, showYear = true, showSurge = true }) {
  return (
    <div className="controls-bar">
      <label className="control">
        <span>How much will the world pollute?</span>
        <select value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Emissions scenario">
          {SCENARIOS.map((x) => (
            <option key={x.id} value={x.id}>{x.label}</option>
          ))}
        </select>
      </label>
      {showYear && (
        <label className="control">
          <span>Which year?</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
            {YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      )}
      {showSurge && (
        <label className="control">
          <span>How strong a storm?</span>
          <select value={surge} onChange={(e) => setSurge(Number(e.target.value))} aria-label="Storm surge">
            {SURGES.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </label>
      )}
      <p className="controls-summary">
        Showing: <b>{showYear ? year : "2100"}</b>, if {scenarioOf(scenario).plain}
        {showSurge && <>, with <b>{surgeOf(surge).short}</b> hitting the coast</>}.
      </p>
    </div>
  );
}

export function Panel({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <div className="panel-heading">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function ScoreBar({ label, value, hint, color }) {
  const pct = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  return (
    <div className="score-bar">
      <div className="score-bar-top">
        <span>{label}</span>
        <b style={{ color }}>{value ?? "--"}</b>
      </div>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function RiskBadge({ level }) {
  return <span className={`risk-badge ${level}`}>{level}</span>;
}

export function LinkButton({ onClick, children, variant = "ghost" }) {
  return (
    <button className={`link-button ${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}
