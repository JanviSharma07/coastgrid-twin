import { Waves, Wind, ThermometerSun, Sparkles, TrendingDown, CloudRain, Tornado, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { SOLUTIONS } from "../lib/solutions";

const ICONS = { Waves, Wind, ThermometerSun, Sparkles, TrendingDown, CloudRain, Tornado };

/** Big, plain "You may face → Do this" card. `headline` can add a site/forecast-specific line. */
export default function ActionCard({ threat, headline, sites, compact = false }) {
  const s = SOLUTIONS[threat];
  if (!s) return null;
  const Icon = ICONS[s.icon] || AlertTriangle;
  return (
    <article className={`action-card ${compact ? "compact" : ""}`} style={{ "--c": s.color }}>
      <header>
        <span className="action-icon"><Icon size={24} /></span>
        <div>
          <h3>{s.title}</h3>
          {headline && <p className="action-headline">{headline}</p>}
        </div>
      </header>
      <div className="action-face">
        <b><AlertTriangle size={15} /> You may face</b>
        <p>{s.face}</p>
        {!compact && <small>Why: {s.why}</small>}
      </div>
      <div className="action-do">
        <b><CheckCircle2 size={15} /> Do this</b>
        <ol>{s.actions.map((a) => <li key={a}>{a}</li>)}</ol>
      </div>
      <footer><Clock size={14} /> <span>When: {s.when}</span></footer>
      {sites && sites.length > 0 && <div className="action-sites">Sites first in line: {sites.join(", ")}</div>}
    </article>
  );
}
