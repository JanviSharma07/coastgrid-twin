import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Play, Pause, RotateCcw } from "lucide-react";
import AssetMap from "../components/AssetMap";
import { InfoBox, Panel } from "../components/ui";
import { getRisk, getFloodZones } from "../services/api";
import { YEARS, RISK_COLORS, band, TOOLTIP_STYLE, scenarioOf, surgeOf } from "../lib/utils";

const MODES = [
  { id: "water", label: "Water reached?", hint: "Red = storm water above the equipment base, amber = less than 0.5 m to spare." },
  { id: "risk", label: "Overall risk", hint: "Flood + heat + salt, weighted by importance (0–1 score)." },
];

export default function FutureMap({ region, regionInfo, scenario, surge, model, go, setSelectedId, selectedId, built }) {
  const [frames, setFrames] = useState({}); // year -> { risk, zones }
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState("water");
  const [layers, setLayers] = useState({ assets: true, flood: true, safe: false, sinking: true });
  const timer = useRef(null);
  const sub = regionInfo?.subsidence;

  useEffect(() => {
    if (!built) return;
    let cancelled = false;
    setFrames({});
    Promise.all(YEARS.map(async (y) => {
      const params = { region, scenario, year: y, surge };
      const [r, z] = await Promise.allSettled([getRisk(params), getFloodZones(params)]);
      return [y, { risk: r.value?.data, zones: z.value?.data }];
    })).then((pairs) => !cancelled && setFrames(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [region, scenario, surge, built]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setIdx((i) => {
        if (i >= YEARS.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1300);
    return () => clearInterval(timer.current);
  }, [playing]);

  const ready = Object.keys(frames).length === YEARS.length;
  const year = YEARS[idx];
  const frame = frames[year];
  const assets = frame?.risk?.features || [];

  const series = useMemo(() => YEARS.map((y) => {
    const f = frames[y]?.risk;
    return { year: y, area: f?.summary?.flood_area_km2 ?? null,
      flooded: (f?.features || []).filter((x) => x.properties.margin_m < 0).length };
  }), [frames]);
  const cur = series[idx];
  const prev = idx > 0 ? series[idx - 1] : null;
  const newlyFlooded = useMemo(() => {
    if (!frame) return [];
    const before = new Set((frames[YEARS[idx - 1]]?.risk?.features || []).filter((f) => f.properties.margin_m < 0).map((f) => f.properties.id));
    return assets.filter((f) => f.properties.margin_m < 0 && !before.has(f.properties.id));
  }, [frame, frames, idx, assets]);

  const assetColor = mode === "water"
    ? (p) => (p.margin_m < 0 ? RISK_COLORS.high : p.margin_m < 0.5 ? RISK_COLORS.medium : RISK_COLORS.low)
    : (p) => RISK_COLORS[band(p.risk_score, model)];

  const play = () => {
    if (idx >= YEARS.length - 1) setIdx(0);
    setPlaying(true);
  };

  return (
    <div className="page">
      <InfoBox steps={["Pick an emissions path and storm size above.", "Press Play and watch 2030 → 2100.", "Click any dot to select it, then open it in My Substation."]}>
        Watch how the sea reaches {regionInfo?.short || "the city"}'s grid. Each step is one decade: the blue area is land
        under sea water during the chosen storm, and dots turn red when water rises above the equipment.
      </InfoBox>

      <div className="timelapse-bar">
        <button className="primary-button inline" onClick={playing ? () => setPlaying(false) : play} disabled={!ready}>
          {playing ? <Pause size={18} /> : <Play size={18} />} {ready ? (playing ? "Pause" : "Play 2030 → 2100") : "Loading 8 decades…"}
        </button>
        <button className="link-button" onClick={() => { setPlaying(false); setIdx(0); }}><RotateCcw size={14} /> Reset</button>
        <input type="range" min={0} max={YEARS.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} aria-label="Year" />
        <div className="year-big">{year}</div>
      </div>

      <div className="map-layout">
        <Panel className="map-side">
          <div className="tl-stat"><b className="c-high">{cur?.flooded ?? "–"}</b><span>assets with water above their equipment</span>
            {prev && cur && cur.flooded > prev.flooded && <small>+{cur.flooded - prev.flooded} since {prev.year}</small>}</div>
          <div className="tl-stat"><b className="c-blue">{cur?.area ?? "–"} km²</b><span>land under sea water</span></div>
          {newlyFlooded.length > 0 && (
            <div className="newly">
              <small>Newly flooded in this decade:</small>
              {newlyFlooded.slice(0, 5).map((f) => <button key={f.properties.id} onClick={() => go("asset", f.properties.id)}>{f.properties.name}</button>)}
            </div>
          )}
          <h3 className="side-title">Colour dots by</h3>
          <div className="segmented">
            {MODES.map((m) => <button key={m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>)}
          </div>
          <p className="side-hint">{MODES.find((m) => m.id === mode).hint}</p>
          <h3 className="side-title">Layers</h3>
          {[["assets", "Power assets"], ["flood", "Flooded land"], ["sinking", sub?.hotspots?.length ? "Land-sinking hotspots" : "Land-sinking hotspots (none published)"]].map(([k, label]) => (
            <label className="layer-toggle" key={k}>
              <input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} />
              <span><b>{label}</b></span>
            </label>
          ))}
          <div style={{ width: "100%", height: 120, marginTop: 10 }}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <XAxis dataKey="year" stroke="#8294a9" fontSize={10} />
                <YAxis stroke="#8294a9" fontSize={10} />
                <Tooltip formatter={(v) => [`${v} km²`, "Flooded land"]} contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine x={year} stroke="#2dd4bf" />
                <Area dataKey="area" stroke="#38bdf8" fill="rgba(56,189,248,0.3)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="side-hint">{scenarioOf(scenario).label} · {surgeOf(surge).label}</p>
          <button className="primary-button" onClick={() => go("asset", selectedId)} disabled={!selectedId}>Open selected asset</button>
        </Panel>

        <Panel className="map-main">
          <AssetMap mapKey={`future-${region}`} assets={assets} floodZones={frame?.zones} model={model} assetColor={assetColor}
            hotspots={sub?.hotspots || []} sinkRadiusKm={sub?.radius_km || 1.5} layers={layers} selectedId={selectedId}
            layerKey={`tl-${region}-${scenario}-${surge}-${year}`} center={regionInfo?.center} zoom={regionInfo?.zoom} height={620}
            legend={false} onSelect={setSelectedId} />
          <div className="map-legend">
            {mode === "water" ? (
              <><span><i className="dot high"></i> Water above equipment</span><span><i className="dot medium"></i> Under 0.5 m to spare</span><span><i className="dot low"></i> Dry</span></>
            ) : (
              <><span><i className="dot high"></i> High risk</span><span><i className="dot medium"></i> Medium</span><span><i className="dot low"></i> Low</span></>
            )}
            <span><i className="swatch flood"></i> Flooded land</span>
            {layers.sinking && sub?.hotspots?.length > 0 && <span><i className="dot sink"></i> Land-sinking hotspot</span>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
