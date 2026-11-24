import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CloudRain, Wind, Waves, Thermometer, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { InfoBox, Panel } from "../components/ui";
import { storage, floodYearText, scenarioOf, surgeOf } from "../lib/utils";

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

const CHECKLISTS = {
  "Before the northeast monsoon (by October)": [
    "Clear storm-water drains and cable trenches around low-lying substations on the priority list",
    "Test dewatering pumps and keep fuel for them on site",
    "Stock sandbags / temporary flood barriers for assets with less than 0.5 m safety margin",
    "Wash or clean insulators within 3 km of the sea (salt build-up causes flashovers)",
    "Check transformer cooling (fans, oil levels) at high heat-stress sites",
    "Agree a backup supply plan for hospitals fed by high-risk substations",
  ],
  "24–72 hours before a cyclone": [
    "Follow IMD cyclone bulletins and INCOIS storm-surge / high-wave warnings",
    "Pre-position crews, poles, conductors and mobile transformers outside flood zones",
    "Confirm diesel back-up at hospitals and water pumping stations",
    "Plan controlled shutdown of substations expected to flood, to avoid equipment damage and electrocution risk",
    "Share the high-risk asset list with the district disaster control room",
  ],
  "After the storm": [
    "Do not re-energise flooded equipment until it is inspected and dried",
    "Restore hospital and water-supply feeders first",
    "Record water marks at each substation and update plinth heights in the twin",
    "Wash salt-sprayed insulators before full load is restored",
  ],
};

const fmtDay = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export default function Weather({ region, ocean, priorities, scenario, year, surge, go }) {
  const [wx, setWx] = useState(null);
  const [sea, setSea] = useState(null);
  const [wxError, setWxError] = useState("");
  const [checked, setChecked] = useState(() => storage.get("cg-checklist", {}));
  const [lat, lon] = region?.center || [13.05, 80.24];

  useEffect(() => {
    const common = { timezone: "Asia/Kolkata", forecast_days: 7 };
    axios
      .get("https://api.open-meteo.com/v1/forecast", {
        params: {
          latitude: lat, longitude: lon, ...common,
          daily: "temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max",
        },
        timeout: 15000,
      })
      .then((r) => setWx(r.data.daily))
      .catch(() => setWxError("Live forecast could not be loaded right now (Open-Meteo unreachable). Please try again later."));
    axios
      .get("https://marine-api.open-meteo.com/v1/marine", {
        params: { latitude: lat, longitude: 80.36, ...common, daily: "wave_height_max" },
        timeout: 15000,
      })
      .then((r) => setSea(r.data.daily))
      .catch(() => {});
  }, [lat, lon]);

  useEffect(() => storage.set("cg-checklist", checked), [checked]);

  const days = useMemo(() => {
    if (!wx) return [];
    return wx.time.map((t, i) => {
      const rain = wx.precipitation_sum[i];
      const gust = wx.wind_gusts_10m_max[i];
      const wave = sea?.wave_height_max?.[i];
      const alerts = [];
      if (rain >= 64.5) alerts.push(`${rainCat(rain).label} rain: risk of waterlogging at low substations`);
      if (gust >= GALE_KMH) alerts.push("Gale-force gusts: line and pole damage possible");
      if (wave >= ROUGH_SEA_M) alerts.push("Rough sea: higher water at the shore");
      return {
        date: t, rain, cat: rainCat(rain), prob: wx.precipitation_probability_max?.[i], tmax: wx.temperature_2m_max[i],
        wind: wx.wind_speed_10m_max[i], gust, wave, alerts,
      };
    });
  }, [wx, sea]);

  const alertDays = days.filter((d) => d.alerts.length);
  const watch = useMemo(() => priorities.slice().sort((a, b) => a.margin_m - b.margin_m).slice(0, 5), [priorities]);
  const mhw = ocean?.marine_heatwave;
  const sst = ocean?.sst;

  const total = Object.values(CHECKLISTS).flat().length;
  const done = Object.values(checked).filter(Boolean).length;

  return (
    <div className="page">
      <InfoBox steps={["Check the 7-day outlook for red flags.", "Look at which substations to watch first.", "Tick off the precautions checklist with your team."]}>
        The rest of the app looks decades ahead. This page is about <b>this week</b>: a live Chennai forecast from
        Open-Meteo, labelled with the India Meteorological Department's (IMD) rain categories, the current sea-heat
        status, and a checklist of precautions to take <b>before</b> a storm. Always follow official IMD warnings.
      </InfoBox>

      {alertDays.length > 0 ? (
        <div className="alert-banner">
          <AlertTriangle size={18} />
          <div>
            <b>Heads-up for the next 7 days:</b>
            {alertDays.map((d) => (
              <div key={d.date}>{fmtDay(d.date)}: {d.alerts.join(" · ")}</div>
            ))}
          </div>
        </div>
      ) : wx ? (
        <div className="ok-banner"><CheckCircle2 size={18} /> No heavy rain, gale-force gusts or rough seas in the 7-day forecast.</div>
      ) : null}

      <Panel title="7-day forecast for Chennai" subtitle="Source: Open-Meteo (free weather API). Rain category = IMD 24-hour classification">
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
        <p className="chart-source">
          Flags: heavy rain ≥ 64.5 mm/day (IMD), gusts ≥ {GALE_KMH} km/h (gale force), waves ≥ {ROUGH_SEA_M} m (rough sea).
          Note: our long-term model covers sea flooding; rain-driven street flooding is not modelled yet.
        </p>
      </Panel>

      <div className="two-col">
        <Panel title="Sea heat right now" subtitle="NOAA Coral Reef Watch marine heatwaves + Open-Meteo sea temperature">
          {ocean ? (
            <div className="card-grid two">
              <div className="mini-card">
                <small>Marine heatwave status</small>
                <h3>{mhw ? MHW_CATS[mhw.mhw_category_latest] ?? "–" : "–"}</h3>
                <p>{mhw ? `as of ${mhw.mhw_latest_date}` : "not available"}</p>
              </div>
              <div className="mini-card">
                <small>Heatwave days in the last year</small>
                <h3>{mhw?.mhw_days_last_year ?? "–"}</h3>
                <p>strongest: {mhw ? MHW_CATS[mhw.mhw_max_category] : "–"}</p>
              </div>
              <div className="mini-card">
                <small>Sea surface temperature</small>
                <h3>{sst?.sst_latest_c ?? "–"}°C</h3>
                <p>3-month average {sst?.sst_mean_92d_c ?? "–"}°C, peak {sst?.sst_max_92d_c ?? "–"}°C</p>
              </div>
              <div className="mini-card">
                <small>Wind from the sea</small>
                <h3>{ocean.era5 ? `${Math.round(ocean.era5.onshore_fraction * 100)}%` : "–"}</h3>
                <p>of hours in {ocean.era5?.year ?? "the last year"} (ERA5) — carries salt inland</p>
              </div>
            </div>
          ) : (
            <p className="empty-message">Loading ocean data…</p>
          )}
          <p className="chart-source">
            Why it matters: hotter sea and air make transformers run hotter and reduce how much load they can safely carry;
            sea wind carries salt that corrodes equipment.
          </p>
        </Panel>

        <Panel title="Substations to watch first in a storm" subtitle={`Smallest safety margin for ${year}, ${scenarioOf(scenario).short}, ${surgeOf(surge).short}`}>
          <div className="priority-list">
            {watch.map((r) => (
              <button key={r.id} className="priority-item as-button" onClick={() => go("asset", r.id)}>
                <span className="priority-number">{r.margin_m < 0 ? "!" : "•"}</span>
                <div>
                  <h3>{r.name}</h3>
                  <p>Margin {r.margin_m} m · first flooded {floodYearText(r.flood_year)}</p>
                </div>
              </button>
            ))}
          </div>
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

      <Panel title="Official sources to follow" subtitle="Warnings from these agencies always come first">
        <div className="link-grid">
          <a href="https://mausam.imd.gov.in/chennai/" target="_blank" rel="noreferrer">IMD Regional Met Centre, Chennai <ExternalLink size={13} /></a>
          <a href="https://rsmcnewdelhi.imd.gov.in/" target="_blank" rel="noreferrer">IMD cyclone warnings (RSMC New Delhi) <ExternalLink size={13} /></a>
          <a href="https://incois.gov.in/" target="_blank" rel="noreferrer">INCOIS ocean state & high-wave alerts <ExternalLink size={13} /></a>
          <a href="https://tnsdma.tn.gov.in/" target="_blank" rel="noreferrer">Tamil Nadu State Disaster Management Authority <ExternalLink size={13} /></a>
        </div>
      </Panel>
    </div>
  );
}
