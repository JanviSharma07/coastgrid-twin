import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { CloudRain, Wind, Waves, Thermometer, ExternalLink, AlertTriangle, CheckCircle2, Play, Pause, Power } from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import AssetMap, { TypeLegend } from "../components/AssetMap";
import WeatherField from "../components/WeatherField";
import ActionCard from "../components/ActionCard";
import { SOLUTIONS } from "../lib/solutions";
import { InfoBox, Panel } from "../components/ui";
import { getRisk, getFloodZones, getAreaImpact } from "../services/api";
import { SURGES, storage, TOOLTIP_STYLE } from "../lib/utils";

// IMD 24-hour rainfall categories (mm)
const IMD_RAIN = [
  { min: 204.5, label: "Extremely heavy", level: "high" },
  { min: 115.6, label: "Very heavy", level: "high" },
  { min: 64.5, label: "Heavy", level: "high" },
  { min: 15.6, label: "Moderate", level: "medium" },
  { min: 2.5, label: "Light", level: "low" },
  { min: 0.1, label: "Very light", level: "low" },
  { min: -1, label: "No rain", level: "low" },
];
const rainCat = (mm) => IMD_RAIN.find((c) => (mm ?? 0) >= c.min);
const GALE_KMH = 62; // Beaufort force 8 (gale) starts at 62 km/h
const ROUGH_SEA_M = 2.5; // WMO sea state 5 "rough" starts at 2.5 m
const MHW_CATS = ["No heatwave", "Moderate", "Strong", "Severe", "Extreme"];
const REPLAY_YEAR = 2030; // nearest modelled decade to today
const REPLAY_SCENARIO = "ssp245";

const CHECKLISTS = {
  "Before the monsoon / cyclone season": [
    "Clear storm-water drains and cable trenches around substations on the shutdown list",
    "Test dewatering pumps and keep fuel for them on site",
    "Stock sandbags / temporary flood barriers for sites with under 0.5 m safety margin",
    "Wash or clean insulators within 3 km of the sea (salt build-up causes flashovers)",
    "Check transformer cooling (fans, oil levels) at high heat-stress sites",
    "Agree backup supply for hospitals listed on the Area & People screen",
  ],
  "24–72 hours before landfall": [
    "Follow IMD cyclone bulletins and INCOIS storm-surge / high-wave warnings",
    "Pre-position crews, poles, conductors and mobile transformers outside flood zones",
    "Confirm diesel back-up at hospitals and water-pumping stations",
    "Plan controlled shutdown in the order below, to avoid equipment damage and electrocution risk",
    "Share the shutdown list with the district disaster control room",
  ],
  "After the storm": [
    "Do not re-energise flooded equipment until it is inspected and dried",
    "Restore hospital and water-supply feeders first",
    "Record water marks at each substation and update plinth heights in the twin",
    "Wash salt-sprayed insulators before full load is restored",
  ],
};

const fmtDay = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

const HEAT_C = 37; // IMD heat-wave threshold for coastal stations (with departure criteria)

export default function StormWatch({ region, regionInfo, ocean, model, go, built, assets, priorities }) {
  const [wx, setWx] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [sea, setSea] = useState(null);
  const [wxError, setWxError] = useState("");
  const [checked, setChecked] = useState(() => storage.get("cg-checklist", {}));
  const [replay, setReplay] = useState({}); // surge -> { risk, zones, area }
  const [step, setStep] = useState(2);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const [lat, lon] = regionInfo?.center || [13.05, 80.24];

  useEffect(() => {
    setWx(null);
    setSea(null);
    setWxError("");
    const common = { timezone: "Asia/Kolkata", forecast_days: 7 };
    axios.get("https://api.open-meteo.com/v1/forecast", {
      params: { latitude: lat, longitude: lon, ...common,
        daily: "temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max",
        hourly: "wind_speed_10m,wind_gusts_10m,precipitation" },
      timeout: 15000,
    }).then((r) => { setWx(r.data.daily); setHourly(r.data.hourly || null); })
      .catch(() => setWxError("Live forecast could not be loaded right now (Open-Meteo unreachable). Please try again later."));
    const op = regionInfo?.ocean_point || [lat, lon];
    axios.get("https://marine-api.open-meteo.com/v1/marine", {
      params: { latitude: op[0], longitude: op[1], ...common, daily: "wave_height_max" }, timeout: 15000,
    }).then((r) => setSea(r.data.daily)).catch(() => {});
  }, [lat, lon, regionInfo]);

  // Load the four storm sizes for the replay
  useEffect(() => {
    if (!built) return;
    let cancelled = false;
    setReplay({});
    Promise.all(SURGES.map(async (s) => {
      const params = { region, scenario: REPLAY_SCENARIO, year: REPLAY_YEAR, surge: s.value };
      const [r, z, a] = await Promise.allSettled([getRisk(params), getFloodZones(params), getAreaImpact(params)]);
      return [s.value, { risk: r.value?.data, zones: z.value?.data, area: a.value?.data }];
    })).then((pairs) => !cancelled && setReplay(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [region, built]);

  useEffect(() => storage.set("cg-checklist", checked), [checked]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStep((s) => {
        if (s >= SURGES.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1600);
    return () => clearInterval(timer.current);
  }, [playing]);

  const play = () => {
    if (step >= SURGES.length - 1) setStep(0);
    setPlaying(true);
  };

  const cur = replay[SURGES[step].value];
  const curAssets = cur?.risk?.features || [];
  const flooded = curAssets.filter((f) => f.properties.margin_m < 0);
  const nearly = curAssets.filter((f) => f.properties.margin_m >= 0 && f.properties.margin_m < 0.5);

  // Shutdown order: the storm size at which each asset first floods, then the deepest water
  const shutdown = useMemo(() => {
    const first = {};
    SURGES.forEach((s, i) => {
      (replay[s.value]?.risk?.features || []).forEach((f) => {
        const p = f.properties;
        if (p.margin_m < 0 && first[p.id] === undefined) first[p.id] = { i, p };
      });
    });
    return Object.values(first).sort((a, b) => a.i - b.i || a.p.margin_m - b.p.margin_m);
  }, [replay]);

  const days = useMemo(() => {
    if (!wx) return [];
    return wx.time.map((t, i) => {
      const rain = wx.precipitation_sum[i];
      const gust = wx.wind_gusts_10m_max[i];
      const wave = sea?.wave_height_max?.[i];
      const alerts = [];
      if (rain >= 64.5) alerts.push(`${rainCat(rain).label} rain: waterlogging risk at low substations`);
      if (gust >= GALE_KMH) alerts.push("Gale-force gusts: line and pole damage possible");
      if (wave >= ROUGH_SEA_M) alerts.push("Rough sea: higher water at the shore");
      return { date: t, rain, cat: rainCat(rain), prob: wx.precipitation_probability_max?.[i], tmax: wx.temperature_2m_max[i],
        wind: wx.wind_speed_10m_max[i], gust, wave, alerts };
    });
  }, [wx, sea]);
  const alertDays = days.filter((d) => d.alerts.length);
  const hourlyData = useMemo(() => {
    if (!hourly?.time) return [];
    const now = Date.now();
    const start = Math.max(0, hourly.time.findIndex((x) => new Date(x).getTime() >= now) - 1);
    return hourly.time.slice(start, start + 48).map((x, i) => ({
      t: new Date(x).toLocaleString("en-IN", { weekday: "short", hour: "2-digit" }),
      wind: hourly.wind_speed_10m[start + i], gust: hourly.wind_gusts_10m[start + i], rain: hourly.precipitation[start + i],
    }));
  }, [hourly]);
  // Forecast-driven action cards
  const lowSites = useMemo(() => priorities.filter((r) => r.type === "substation").slice().sort((a, b) => a.margin_m - b.margin_m).slice(0, 3).map((r) => r.name), [priorities]);
  const coastSites = useMemo(() => assets.map((f) => f.properties).filter((p) => p.dist_coast_km <= 2).sort((a, b) => a.dist_coast_km - b.dist_coast_km).slice(0, 3).map((p) => p.name), [assets]);
  const weekCards = useMemo(() => {
    const out = [];
    const first = (f) => days.find(f);
    const r = first((d) => d.rain >= 64.5);
    if (r) out.push({ threat: "rain", headline: `${fmtDay(r.date)}: ${r.rain} mm forecast (IMD "${r.cat.label}")`, sites: lowSites });
    const g = first((d) => d.gust >= GALE_KMH);
    if (g) out.push({ threat: "wind", headline: `${fmtDay(g.date)}: gusts up to ${Math.round(g.gust)} km/h` });
    const w = first((d) => d.wave >= ROUGH_SEA_M);
    if (w) out.push({ threat: "waves", headline: `${fmtDay(w.date)}: waves up to ${w.wave} m offshore`, sites: coastSites });
    const h = first((d) => d.tmax >= HEAT_C);
    if (h) out.push({ threat: "heat", headline: `${fmtDay(h.date)}: up to ${Math.round(h.tmax)}°C` });
    return out;
  }, [days, lowSites, coastSites]);
  const mhw = ocean?.marine_heatwave;
  const total = Object.values(CHECKLISTS).flat().length;
  const done = Object.values(checked).filter(Boolean).length;
  const assetColor = (p) => (p.margin_m < 0 ? "#fb7185" : p.margin_m < 0.5 ? "#fbbf24" : "#34d399");

  return (
    <div className="page">
      <InfoBox steps={["Check the 7-day outlook for red flags.", "Press play on the cyclone replay to see what goes under as storms get stronger.", "Use the shutdown order and the checklist with your team."]}>
        The control-room screen. It covers <b>this week</b>: a live forecast for {regionInfo?.short || "the city"} labelled with IMD's
        rain categories, and a replay of what today's sea plus a storm surge would do to the grid. That gives you a
        shutdown order and a checklist. Always follow official IMD and INCOIS warnings.
      </InfoBox>

      <Panel title={`Live weather & sea around ${regionInfo?.short || "the city"}`} subtitle="Press play to move through the next 48 hours. Switch layers: wind, gusts, rain, temperature, waves">
        <WeatherField regionInfo={regionInfo} assets={assets} priorities={priorities} />
      </Panel>

      <section className="week-actions">
        <h2 className="section-title">{weekCards.length ? "Alerts this week: what you may face, and what to do" : "No alerts this week"}</h2>
        <div className="action-grid">
          {weekCards.length ? weekCards.map((c) => <ActionCard key={c.threat} {...c} />) : (
            <div className="ok-banner"><CheckCircle2 size={18} /> No heavy rain, gale-force gusts, rough sea or coastal heat-wave levels forecast this week. Alert cards appear here automatically when the forecast changes.</div>
          )}
        </div>
      </section>

      {alertDays.length > 0 ? (
        <div className="alert-banner">
          <AlertTriangle size={18} />
          <div>
            <b>Heads-up for the next 7 days:</b>
            {alertDays.map((d) => <div key={d.date}>{fmtDay(d.date)}: {d.alerts.join(" · ")}</div>)}
          </div>
        </div>
      ) : wx ? (
        <div className="ok-banner"><CheckCircle2 size={18} /> No heavy rain, gale-force gusts or rough seas in the 7-day forecast.</div>
      ) : null}

      <Panel title={`7-day forecast · ${regionInfo?.short || ""}`} subtitle="Open-Meteo (free). Rain category = IMD 24-hour classification">
        {wxError && <p className="error-message">{wxError}</p>}
        {!wx && !wxError && <p className="empty-message">Loading forecast…</p>}
        <div className="forecast-grid">
          {days.map((d) => (
            <div key={d.date} className={`forecast-day ${d.alerts.length ? "warn" : ""}`}>
              <h4>{fmtDay(d.date)}</h4>
              <p><CloudRain size={14} /> {d.rain} mm{d.prob !== undefined && d.prob !== null ? ` · ${d.prob}%` : ""}</p>
              <span className={`risk-badge ${d.cat.level}`}>{d.cat.label}</span>
              <p><Wind size={14} /> {Math.round(d.wind)} km/h, gusts {Math.round(d.gust)}</p>
              <p><Waves size={14} /> {d.wave !== undefined && d.wave !== null ? `${d.wave} m waves` : "waves n/a"}</p>
              <p><Thermometer size={14} /> {Math.round(d.tmax)}°C max</p>
            </div>
          ))}
        </div>
        {hourlyData.length > 0 && (
          <div style={{ width: "100%", height: 230, marginTop: 16 }}>
            <ResponsiveContainer>
              <ComposedChart data={hourlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid stroke="#26374b" strokeDasharray="4 4" />
                <XAxis dataKey="t" stroke="#8294a9" fontSize={10} interval={5} />
                <YAxis yAxisId="w" stroke="#8294a9" fontSize={10} unit=" km/h" />
                <YAxis yAxisId="r" orientation="right" stroke="#60a5fa" fontSize={10} unit=" mm" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="r" dataKey="rain" name="Rain (mm/h)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Line yAxisId="w" dataKey="wind" name="Wind (km/h)" stroke="#2dd4bf" dot={false} strokeWidth={2} />
                <Line yAxisId="w" dataKey="gust" name="Gusts (km/h)" stroke="#f472b6" dot={false} strokeWidth={2} strokeDasharray="4 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="chart-source">
          Chart: next 48 hours at the city centre. Flags: heavy rain ≥ 64.5 mm/day (IMD), gusts ≥ {GALE_KMH} km/h (gale), waves ≥ {ROUGH_SEA_M} m (rough sea).
          The replay below models sea water; flooding from rain is not modelled yet.
        </p>
      </Panel>

      {built && (
        <div className="two-col wide-left">
          <Panel title="Cyclone replay: what goes under as the storm gets stronger"
            subtitle={`Today's sea (${REPLAY_YEAR} level, intermediate path) + storm surge`}
            right={<button className="primary-button inline" onClick={playing ? () => setPlaying(false) : play} disabled={!cur}>
              {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play replay"}
            </button>}>
            <div className="replay-steps">
              {SURGES.map((s, i) => (
                <button key={s.value} className={i === step ? "on" : i < step ? "past" : ""} onClick={() => { setPlaying(false); setStep(i); }}>
                  {s.label}
                </button>
              ))}
            </div>
            <AssetMap mapKey={`storm-${region}`} assets={curAssets} floodZones={cur?.zones} model={model} assetColor={assetColor}
              floodLayers={SURGES.slice(0, step + 1).map((s_) => ({ key: `fl-${region}-${s_.value}`, data: replay[s_.value]?.zones, opacity: 0.2 }))}
              layers={{ assets: true, flood: true, safe: false, sinking: false }} layerKey={`storm-${step}-${region}`}
              center={regionInfo?.center} zoom={regionInfo?.zoom} height={430} legend={false}
              points={(cur?.area?.flooded_hospitals || []).map((h) => ({ ...h, icon: "hospital", color: "#f472b6", label: `Hospital in flood water: ${h.name}` }))}
              onSelect={(id) => go("asset", id)} />
            <div className="map-legend">
              <span><i className="dot high"></i> Water above equipment</span>
              <span><i className="dot medium"></i> Less than 0.5 m to spare</span>
              <span><i className="dot low"></i> Dry</span>
              <span><i className="gm-hosp" style={{ "--f": "#f472b6" }}>+</i> Hospital in flood water</span>
              <span><i className="swatch flood"></i> Flooded land (darker = floods even in a smaller storm)</span>
              <TypeLegend />
            </div>
          </Panel>

          <Panel title="Live count">
            <div className="replay-counts">
              <div><b className="c-high">{flooded.length}</b><span>assets with water above their equipment</span></div>
              <div><b className="c-med">{nearly.length}</b><span>with under 0.5 m to spare</span></div>
              <div><b className="c-pink">{cur?.area?.flooded_hospitals?.length ?? "–"}</b><span>hospitals standing in flood water</span></div>
              <div><b className="c-blue">{cur?.risk?.summary?.flood_area_km2 ?? "–"} km²</b><span>land under sea water</span></div>
            </div>
            <h3 className="side-title"><Power size={15} /> Controlled shutdown order</h3>
            {shutdown.length ? (
              <ol className="shutdown-list">
                {shutdown.slice(0, 10).map(({ i, p }) => (
                  <li key={p.id}>
                    <button onClick={() => go("asset", p.id)}>{p.name}</button>
                    <small>floods from a {SURGES[i].label.toLowerCase()}</small>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-message">{cur ? "No asset floods at any storm size with today's sea." : "Loading replay…"}</p>}
          </Panel>
        </div>
      )}

      <div className="two-col">
        <Panel title="Sea heat right now" subtitle="NOAA Coral Reef Watch + Open-Meteo sea temperature">
          {ocean ? (
            <div className="card-grid two">
              <div className="mini-card"><small>Marine heatwave status</small><h3>{mhw ? MHW_CATS[mhw.mhw_category_latest] ?? "–" : "–"}</h3><p>{mhw ? `as of ${mhw.mhw_latest_date}` : "not available"}</p></div>
              <div className="mini-card"><small>Heatwave days, last 12 months</small><h3>{mhw?.mhw_days_last_year ?? "–"}</h3><p>strongest: {mhw ? MHW_CATS[mhw.mhw_max_category] : "–"}</p></div>
              <div className="mini-card"><small>Sea surface temperature</small><h3>{ocean.sst?.sst_latest_c ?? "–"}°C</h3><p>3-month average {ocean.sst?.sst_mean_92d_c ?? "–"}°C</p></div>
              <div className="mini-card"><small>Wind from the sea</small><h3>{ocean.era5 ? `${Math.round(ocean.era5.onshore_fraction * 100)}%` : "–"}</h3><p>of hours in {ocean.era5?.year ?? "the last year"}: carries salt inland</p></div>
            </div>
          ) : <p className="empty-message">Ocean data not available for this city yet.</p>}
        </Panel>
        <Panel title="Official sources to follow" subtitle="Their warnings always come first">
          <div className="link-grid one">
            <a href="https://mausam.imd.gov.in/" target="_blank" rel="noreferrer">India Meteorological Department <ExternalLink size={13} /></a>
            <a href="https://rsmcnewdelhi.imd.gov.in/" target="_blank" rel="noreferrer">IMD cyclone warnings (RSMC New Delhi) <ExternalLink size={13} /></a>
            <a href="https://incois.gov.in/" target="_blank" rel="noreferrer">INCOIS ocean state, high-wave & storm-surge alerts <ExternalLink size={13} /></a>
            <a href="https://ndma.gov.in/" target="_blank" rel="noreferrer">National Disaster Management Authority <ExternalLink size={13} /></a>
          </div>
          {regionInfo?.disaster_authority && <p className="side-hint">State authority for {regionInfo.short}: {regionInfo.disaster_authority}</p>}
        </Panel>
      </div>

      <Panel title="Precautions checklist" subtitle={`${done} of ${total} done · ticks are saved in this browser`}>
        <div className="card-grid three">
          {Object.entries(CHECKLISTS).map(([phase, items]) => (
            <div key={phase} className="checklist">
              <h3>{phase}</h3>
              {items.map((it) => (
                <label key={it} className="check-item">
                  <input type="checkbox" checked={!!checked[it]} onChange={() => setChecked({ ...checked, [it]: !checked[it] })} />
                  <span>{it}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <details className="playbook">
        <summary>Full threat playbook: all seven “you may face → do this” cards for training and reference</summary>
        <div className="action-grid">
          {Object.keys(SOLUTIONS).map((k) => <ActionCard key={k} threat={k} compact />)}
        </div>
      </details>
    </div>
  );
}
