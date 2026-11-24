import { Hospital, MapPinned, Landmark, Home as HomeIcon, Droplets } from "lucide-react";
import AssetMap, { TypeLegend } from "../components/AssetMap";
import { InfoBox, Panel } from "../components/ui";
import TrendCharts from "../components/TrendCharts";

const PREPARE = [
  { icon: Landmark, who: "City corporation & ward offices",
    do: ["Put the flooded neighbourhoods below on the ward-level evacuation and drainage plans",
      "Pre-identify relief shelters on high ground (see Safe Sites for high ground near the grid)",
      "Coordinate the shutdown list with the power utility so residents are warned before supply is cut"] },
  { icon: Hospital, who: "Hospitals",
    do: ["Hospitals in flood water: move generators, fuel and electrical panels above the expected water level",
      "Hospitals near high-risk substations: keep 72 hours of generator fuel and request a second feeder",
      "Share critical-care load with the utility so its feeders are restored first"] },
  { icon: Droplets, who: "Water, telecom & other utilities",
    do: ["Pumping stations and telecom towers fed by high-risk substations need backup power",
      "Agree restoration priorities with the power utility before the season"] },
  { icon: HomeIcon, who: "Residents & welfare associations",
    do: ["Know whether your area is on the flooded list and where the nearest shelter is",
      "Keep meters and inverters off the ground floor in listed areas",
      "Never touch flooded electrical equipment; report it to the utility"] },
];

export default function AreaPeople({ areaImpact, regionInfo, region, floodZones, assets, model, go, year, built, surge, scenario }) {
  const a = areaImpact;
  const points = a ? [
    ...a.flooded_places.map((p) => ({ ...p, icon: "place", label: `Neighbourhood in flood water: ${p.name}` })),
    ...a.hospitals_near_high_risk_substations.map((h) => ({ ...h, icon: "hospital", color: "#fbbf24", label: `Hospital near a high-risk substation: ${h.name}` })),
    ...a.flooded_hospitals.map((h) => ({ ...h, icon: "hospital", color: "#f472b6", label: `Hospital in flood water: ${h.name}` })),
  ] : [];

  return (
    <div className="page">
      <InfoBox steps={["Pick the future above.", "See which neighbourhoods and hospitals are exposed.", "Share the preparation list with each group."]}>
        A substation never floods alone. This screen moves from the grid to the <b>people around it</b>: which named
        neighbourhoods would be under sea water, which hospitals stand in that water, and which hospitals depend on a
        high-risk substation nearby. It also says what each group should prepare beforehand.
      </InfoBox>

      {!a && built && <div className="note-banner">Area data appears after the pipeline is re-run for {regionInfo?.short}. It adds neighbourhoods and hospital names.</div>}

      {a && (
        <section className="stats-grid">
          <div className="stat-card"><div className="stat-top"><span>Neighbourhoods under sea water</span><MapPinned size={20} color="#38bdf8" /></div>
            <h2 style={{ color: "#38bdf8" }}>{a.flooded_places.length}</h2><p>of {a.totals.places} named places in OpenStreetMap</p></div>
          <div className="stat-card"><div className="stat-top"><span>Hospitals in flood water</span><Hospital size={20} color="#f472b6" /></div>
            <h2 style={{ color: "#f472b6" }}>{a.flooded_hospitals.length}</h2><p>of {a.totals.hospitals} hospitals mapped</p></div>
          <div className="stat-card"><div className="stat-top"><span>Hospitals near high-risk substations</span><Hospital size={20} color="#fbbf24" /></div>
            <h2 style={{ color: "#fbbf24" }}>{a.hospitals_near_high_risk_substations.length}</h2><p>within 3 km: need backup supply plans</p></div>
          <div className="stat-card"><div className="stat-top"><span>Year shown</span></div>
            <h2>{year}</h2><p>change it in the bar above</p></div>
        </section>
      )}

      <div className="two-col wide-left">
        <Panel title="Map of the area">
          <AssetMap mapKey={`area-${region}`} assets={assets} floodZones={floodZones} model={model} points={points}
            layers={{ assets: true, flood: true, safe: false, sinking: false }} layerKey={`area-${region}-${year}-${a?.scenario}-${a?.surge}`}
            center={regionInfo?.center} zoom={regionInfo?.zoom} height={460} legend={false} onSelect={(id) => go("asset", id)} />
          <div className="map-legend">
            <span><i className="gm-place mini">Name</i> Neighbourhood in flood water</span>
            <span><i className="gm-hosp" style={{ "--f": "#f472b6" }}>+</i> Hospital in flood water</span>
            <span><i className="gm-hosp" style={{ "--f": "#fbbf24" }}>+</i> Hospital near high-risk substation</span>
            <span><i className="swatch flood"></i> Flooded land</span>
            <TypeLegend />
          </div>
        </Panel>

        <Panel title="Lists to share">
          <h3 className="side-title">Neighbourhoods under sea water</h3>
          <div className="chip-list">
            {a?.flooded_places.length ? a.flooded_places.map((p) => <span key={p.name}>{p.name}</span>) : <p className="empty-message">None in this future.</p>}
          </div>
          <h3 className="side-title">Hospitals in flood water</h3>
          <ul className="plain-list">
            {a?.flooded_hospitals.length ? a.flooded_hospitals.map((h, i) => <li key={i}>{h.name}</li>) : <li className="muted">None in this future.</li>}
          </ul>
          <h3 className="side-title">Hospitals near high-risk substations</h3>
          <ul className="plain-list">
            {a?.hospitals_near_high_risk_substations.length
              ? a.hospitals_near_high_risk_substations.map((h, i) => <li key={i}>{h.name} <small>near {h.substations.join(", ")}</small></li>)
              : <li className="muted">None in this future.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="How exposure grows over the decades" subtitle="Same storm level as selected above">
        <TrendCharts region={region} surge={surge} scenario={scenario} />
      </Panel>

      <Panel title="What each group should prepare beforehand">
        <div className="card-grid four">
          {PREPARE.map(({ icon: Icon, who, do: items }) => (
            <div className="mini-card" key={who}>
              <Icon size={20} className="mini-icon" />
              <h3>{who}</h3>
              <ul className="plain-list">{items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </div>
        <p className="chart-source">Neighbourhood and hospital locations come from OpenStreetMap. A point counts as flooded when its ~150 m grid cell is under sea water in this future.</p>
      </Panel>
    </div>
  );
}
