import { ExternalLink, Database, Cpu, Layers, Gauge, ListChecks } from "lucide-react";
import { InfoBox, Panel } from "../components/ui";

const STEPS = [
  { icon: Database, t: "1. Collect free data", d: "Power assets and hospitals from OpenStreetMap; 30 m ground height from Copernicus; sea-level projections from IPCC AR6; sea heat from NOAA; wind and humidity from ERA5." },
  { icon: Layers, t: "2. Build the twin", d: "Each asset gets its ground height, equipment base, distance to the sea, nearby hospitals and land-sinking rate." },
  { icon: Cpu, t: "3. Run the futures", d: "For 3 emissions paths × 8 decades × 4 storm sizes we compute the storm water level and which land floods (connected to the sea)." },
  { icon: Gauge, t: "4. Score every asset", d: "Flood, heat and salt are each scored 0–1, combined, then weighted by how important the asset is." },
  { icon: ListChecks, t: "5. Turn it into actions", d: "Rank assets, recommend a fix and a deadline, find safe sites, and let you test upgrades." },
];

const GLOSSARY = [
  ["Emissions scenario (SSP)", "A storyline for how much greenhouse gas the world releases. SSP1-2.6 = strong cuts, SSP2-4.5 = middle road, SSP5-8.5 = very high emissions."],
  ["Storm surge", "Sea water pushed onto land by a cyclone's winds and low pressure, on top of the tide. Cyclone Vardah (2016) gave about 1 m of surge plus about 0.47 m of tide in Chennai (IMD)."],
  ["Equipment base / plinth", "The raised platform the transformer and switchgear stand on. If water rises above it, the equipment floods."],
  ["Safety margin", "Equipment base minus storm water level. Negative = flooded."],
  ["Land subsidence", "The ground itself sinking, mostly from groundwater pumping. Parts of Chennai sink by up to about 3 cm a year."],
  ["Marine heatwave", "A spell when the sea is unusually warm for that time of year (NOAA categories: moderate, strong, severe, extreme)."],
  ["Criticality / importance", "How many people depend on an asset: higher voltage and hospitals nearby mean higher importance."],
  ["Flashover", "An electrical short across an insulator, often caused by a salt layer becoming wet in humid air."],
];

export default function HowItWorks({ meta }) {
  const m = meta?.model || {};
  const sources = meta?.sources || [];
  return (
    <div className="page">
      <InfoBox>
        How CoastGrid Twin turns public data into a ranked to-do list, the exact formula, where every number comes from,
        and what the model does not (yet) cover. This is the page to show anyone who asks "can I trust this?".
      </InfoBox>

      <Panel title="From data to decisions in 5 steps">
        <div className="card-grid five">
          {STEPS.map(({ icon: Icon, t, d }) => (
            <div className="mini-card" key={t}>
              <Icon size={20} className="mini-icon" />
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="two-col">
        <Panel title="The formula in plain words">
          <ol className="explain-list numbered">
            <li><b>Storm water level</b> = sea-level rise for that year + land sinking since 2020 + storm surge.</li>
            <li><b>Safety margin</b> = equipment base (ground + {m.default_plinth_m ?? 0.3} m plinth) − storm water level.</li>
            <li><b>Flood score</b> = 1 − margin ÷ {m.flood_margin_scale_m ?? 2} m (kept between 0 and 1). Water at the base → 1; {m.flood_margin_scale_m ?? 2} m or more of margin → 0.</li>
            <li><b>Heat score</b> falls with distance from the sea (halves about every {Math.round((m.heat_decay_km ?? 10) * 0.69)} km), scaled up by how many marine-heatwave days the sea had last year and how humid the air is.</li>
            <li><b>Salt score</b> falls faster (halves about every {((m.salt_decay_km ?? 3) * 0.69).toFixed(1)} km), scaled by how often wind blows from the sea.</li>
            <li><b>Importance</b> = 80% voltage level (power plants count as top level) + 20% hospitals within {m.hospital_radius_km ?? 3} km.</li>
            <li><b>Risk</b> = ({m.w_flood ?? 0.6} × flood + {m.w_heat ?? 0.2} × heat + {m.w_salt ?? 0.2} × salt) × ({m.crit_floor ?? 0.6} + {(1 - (m.crit_floor ?? 0.6)).toFixed(1)} × importance).</li>
            <li><b>High</b> risk ≥ {m.high ?? 0.55}, <b>medium</b> ≥ {m.medium ?? 0.3}, otherwise low.</li>
            <li><b>First flood year</b> = the first year the storm water level reaches the equipment base.</li>
          </ol>
        </Panel>

        <Panel title="Limitations (we say them up front)">
          <ul className="explain-list">
            <li>Sea-level rise uses IPCC AR6 <b>global-average</b> values for now; Chennai-specific values from the NASA tool are the next upgrade.</li>
            <li>Equipment heights are <b>estimated</b> (ground + 0.3 m). Real plinth heights from the utility would sharpen results.</li>
            <li>Flooding is a "bathtub" model: land below the water level that connects to the sea floods. Sea walls and drains are not included.</li>
            <li><b>Rain-driven flooding is not modelled yet</b> (the main cause of the 2015 floods and Cyclone Michaung outages).</li>
            <li>Land sinking uses published hotspots fading to zero over 1.5 km, not a measurement at every asset.</li>
            <li>OpenStreetMap may miss some assets or their voltage; 30 m satellite heights can include buildings and trees.</li>
            <li>Results are for <b>screening and planning</b>, not a replacement for engineering surveys.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Data sources" subtitle="All free and public: no paid services">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>What</th><th>Source</th><th>Licence</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.name}>
                  <td>{s.layer}</td>
                  <td><a href={s.url} target="_blank" rel="noreferrer">{s.name} <ExternalLink size={12} /></a></td>
                  <td>{s.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sources.length && <p className="empty-message">Loading sources…</p>}
        </div>
      </Panel>

      <Panel title="Words used in this app">
        <dl className="glossary">
          {GLOSSARY.map(([t, d]) => (
            <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
