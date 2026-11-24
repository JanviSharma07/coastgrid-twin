import { Building2, Siren, Sun, Landmark, ArrowRight, MousePointerClick, Map, FileDown, Clock } from "lucide-react";
import { Panel } from "../components/ui";

const AUDIENCE = [
  {
    icon: Building2,
    who: "Power companies",
    eg: "e.g. TANGEDCO / TANTRANSCO planners and substation engineers",
    gets: "Which substations to raise or protect first, by which year, and a ranked list to put in the capital budget.",
  },
  {
    icon: Siren,
    who: "Disaster managers",
    eg: "e.g. State Disaster Management Authority, city corporation",
    gets: "Which parts of the grid go under water in a storm, which ones feed hospitals, and a checklist for before the cyclone.",
  },
  {
    icon: Sun,
    who: "Solar & battery developers",
    eg: "e.g. rooftop/utility solar firms, energy department",
    gets: "High ground close to the grid where new solar + battery sites will still be dry in 2100.",
  },
  {
    icon: Landmark,
    who: "Regulators, funders & insurers",
    eg: "e.g. electricity regulator, climate funds",
    gets: "Evidence for climate-resilience spending: every number has a public source you can check.",
  },
];

const FEATURES = [
  { n: 1, name: "Asset map", what: "All substations, power plants, solar and battery sites on one map", page: "map" },
  { n: 2, name: "Hazard layers", what: "Flooded land, land-sinking hotspots, heat and salt colouring", page: "map" },
  { n: 3, name: "Scenario & year controls", what: "Pick how much the world pollutes, the year and the storm size (top bar)", page: "overview" },
  { n: 4, name: "Flood timeline per asset", what: "The year water first reaches each asset's equipment", page: "asset" },
  { n: 5, name: "Heat & salt stress", what: "How hard sea heat and salty air push on equipment near the shore", page: "asset" },
  { n: 6, name: "Risk score 0–1 with criticality", what: "One number per asset; assets near hospitals or at high voltage count more", page: "asset" },
  { n: 7, name: "Priority action list", what: "Ranked list of what to fix first, with the recommended action and budget planner", page: "priorities" },
  { n: 8, name: "Safe-site finder", what: "Best places for new solar + battery that stay dry", page: "safe" },
  { n: 9, name: "What-if simulator", what: "Raise an asset by X metres and see how many years you gain", page: "whatif" },
  { n: 10, name: "Reports & API", what: "CSV / GeoJSON downloads, printable report and an open API", page: "reports" },
];

const NEXT = [
  ["Upload your own asset list", "Utilities upload a CSV with exact plinth heights so results use their real data instead of map estimates."],
  ["Live sensors", "Water-level and transformer-temperature sensors (IoT) feeding the twin in real time."],
  ["Flashover warnings", "Alerts when salt + high humidity make insulator flashover likely."],
  ["Rainfall flooding", "Add rain-driven urban flooding (the main cause of 2015 and Cyclone Michaung 2023 outages) on top of sea flooding."],
  ["Control-room link (SCADA)", "Push alerts into the utility's existing control-room software."],
  ["More coastal cities", "The pipeline is set up per city: adding Mumbai, Kolkata or Dhaka is a new configuration plus a data run."],
];

export default function StartHere({ go, summary, region }) {
  return (
    <div className="page">
      <section className="hero-panel">
        <p className="eyebrow">THE PROBLEM IN ONE LINE</p>
        <h2>
          Chennai's power grid sits right next to a sea that is rising, on land that is sinking, in air that is getting hotter
          and saltier. Utilities don't know <em>which</em> substations will fail first, <em>when</em>, or what to fix first.
        </h2>
        <p className="hero-sub">
          <b>CoastGrid Twin</b> is a digital copy (a "twin") of {region?.name || "Chennai"}'s power network. It combines
          free satellite, ocean and climate data to tell you, for every asset: <b>will it flood, in which year, why, and what to do</b>.
          {summary.total ? <> Right now it tracks <b>{summary.total}</b> real power assets from OpenStreetMap.</> : null}
        </p>
        <div className="hero-actions">
          <button className="primary-button inline" onClick={() => go("overview")}>
            Open the city overview <ArrowRight size={17} />
          </button>
          <button className="link-button" onClick={() => go("method")}>How the numbers are made</button>
        </div>
      </section>

      <Panel title="Who is this for?" subtitle="Four kinds of users, one shared picture">
        <div className="card-grid four">
          {AUDIENCE.map(({ icon: Icon, who, eg, gets }) => (
            <div className="mini-card" key={who}>
              <Icon size={22} className="mini-icon" />
              <h3>{who}</h3>
              <small>{eg}</small>
              <p>{gets}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="How to use it in 3 steps" subtitle="No GIS or coding skills needed: everything is a click">
        <div className="card-grid three">
          <div className="step-card">
            <span className="step-num">1</span>
            <MousePointerClick size={20} />
            <h3>Pick a future</h3>
            <p>Use the three boxes at the top of each page: <b>how much the world pollutes</b>, <b>which year</b> and <b>how strong a storm</b>. Everything updates instantly.</p>
          </div>
          <div className="step-card">
            <span className="step-num">2</span>
            <Map size={20} />
            <h3>See what is at risk</h3>
            <p><b>Red</b> = act now, <b>amber</b> = plan for it, <b>green</b> = keep monitoring. Click any dot on the map to see that asset explained in plain words.</p>
          </div>
          <div className="step-card">
            <span className="step-num">3</span>
            <FileDown size={20} />
            <h3>Decide & share</h3>
            <p>Test a fix in the <b>What-If Simulator</b>, check what your budget covers in <b>Priorities & Budget</b>, then print or download a report.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Where to find each feature" subtitle="All 10 features of our solution, and the page they live on">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>#</th><th>Feature</th><th>What it does for you</th><th></th></tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.n}>
                  <td>{f.n}</td>
                  <td><b>{f.name}</b></td>
                  <td>{f.what}</td>
                  <td><button className="link-button small" onClick={() => go(f.page)}>Open <ArrowRight size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="Why it is easy to use" subtitle="Built for busy engineers and officials, not scientists">
          <ul className="check-list">
            <li>Every page starts with a <b>"What this page tells you"</b> box.</li>
            <li>Plain words: "floods around 2070" instead of raw model output.</li>
            <li>Three colours everywhere: red, amber, green.</li>
            <li>One-click CSV and printable PDF report for meetings.</li>
            <li>Runs in any browser, free, no installation or login.</li>
            <li>Every number traces back to a public data source.</li>
          </ul>
        </Panel>
        <Panel title="Coming next" subtitle="Planned add-ons (not in this version yet)" right={<Clock size={18} color="#fbbf24" />}>
          <ul className="next-list">
            {NEXT.map(([t, d]) => (
              <li key={t}><b>{t}</b><span>{d}</span></li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
