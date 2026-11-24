import { useMemo, useState } from "react";
import AssetMap from "../components/AssetMap";
import { InfoBox, Panel } from "../components/ui";
import { band } from "../lib/utils";

const COLOR_OPTIONS = [
  { id: "risk", label: "Overall risk", hint: "Flood + heat + salt combined, weighted by how important the asset is" },
  { id: "flood", label: "Flood danger", hint: "How close storm water gets to the equipment base" },
  { id: "heat", label: "Heat stress", hint: "Hot, humid sea air near the shore makes transformers run hotter" },
  { id: "salt", label: "Salt corrosion", hint: "Salty sea wind corrodes metal and coats insulators" },
];

const FIELD = { risk: "risk_score", flood: "flood_score", heat: "heat_score", salt: "salt_score" };

export default function RiskMapPage({ assets, floodZones, safeSites, region, model, scenario, year, surge, go, selectedId, setSelectedId }) {
  const [layers, setLayers] = useState({ assets: true, flood: true, safe: true, sinking: true });
  const [colorBy, setColorBy] = useState("risk");
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const sub = region?.subsidence;

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    assets.forEach((f) => c[band(f.properties[FIELD[colorBy]] ?? 0, model)]++);
    return c;
  }, [assets, colorBy, model]);

  return (
    <div className="page">
      <InfoBox steps={["Switch layers on and off with the checkboxes.", "Use “Colour dots by” to see which danger is the main one.", "Click any dot to see its summary, then press “Open selected asset” for the full explanation."]}>
        The map shows every power asset we found in Chennai (from OpenStreetMap), the land that would be under sea water
        for the future you picked, places where the ground itself is sinking, and safe high ground for new solar + battery.
      </InfoBox>

      <div className="map-layout">
        <Panel className="map-side">
          <h3 className="side-title">Layers</h3>
          {[
            ["assets", "Power assets", "Substations, plants, solar & battery"],
            ["flood", "Flooded land", "Sea water for the chosen year + storm"],
            ["sinking", "Land-sinking hotspots", sub ? `Up to ${sub.peak_mm_yr} mm/year (published satellite study)` : "Published hotspots"],
            ["safe", "Safe solar + battery sites", "Dry even in worst-case 2100"],
          ].map(([k, label, hint]) => (
            <label className="layer-toggle" key={k}>
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} />
              <span><b>{label}</b><small>{hint}</small></span>
            </label>
          ))}

          <h3 className="side-title">Colour dots by</h3>
          <div className="segmented">
            {COLOR_OPTIONS.map((o) => (
              <button key={o.id} className={colorBy === o.id ? "on" : ""} onClick={() => setColorBy(o.id)}>{o.label}</button>
            ))}
          </div>
          <p className="side-hint">{COLOR_OPTIONS.find((o) => o.id === colorBy).hint}</p>

          <div className="count-row">
            <span className="high">{counts.high} high</span>
            <span className="medium">{counts.medium} medium</span>
            <span className="low">{counts.low} low</span>
          </div>
          <p className="side-hint">Selected: <b>{assets.find((f) => f.properties.id === selectedId)?.properties.name || "none"}</b></p>
          <button className="primary-button" onClick={() => go("asset", selectedId)} disabled={!selectedId}>Open selected asset</button>
        </Panel>

        <Panel className="map-main">
          <AssetMap
            assets={assets} floodZones={floodZones} safeSites={safeSites}
            hotspots={sub?.hotspots || []} sinkRadiusKm={sub?.radius_km || 1.5}
            layers={layers} colorBy={colorBy} model={model} selectedId={selectedId}
            layerKey={`${scenario}-${year}-${surge}`} center={region?.center} height={620}
            onSelect={setSelectedId}
          />
        </Panel>
      </div>
    </div>
  );
}
