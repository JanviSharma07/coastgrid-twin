import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Play, Pause, Wind, CloudRain, Thermometer, Waves, Gauge } from "lucide-react";
import { typeIcon } from "./markers";

/* ---------- colour scales (stops: value -> rgb) ---------- */
const SCALES = {
  wind: { unit: "km/h", stops: [[0, [95, 70, 210]], [8, [70, 120, 240]], [16, [40, 190, 220]], [35, [90, 200, 120]], [50, [230, 210, 70]], [65, [245, 140, 50]], [85, [220, 50, 60]], [120, [180, 40, 150]]] },
  gust: { unit: "km/h", stops: [[0, [95, 70, 210]], [12, [70, 120, 240]], [25, [40, 190, 220]], [50, [90, 200, 120]], [70, [230, 210, 70]], [90, [245, 140, 50]], [120, [220, 50, 60]], [160, [180, 40, 150]]] },
  temp: { unit: "°C", stops: [[10, [60, 90, 200]], [18, [60, 180, 200]], [24, [120, 200, 110]], [28, [230, 200, 80]], [32, [240, 140, 50]], [36, [220, 60, 50]], [42, [150, 20, 60]]] },
  rain: { unit: "mm/h", stops: [[0, [0, 0, 0, 0]], [0.2, [90, 160, 230]], [1, [50, 110, 220]], [3, [60, 200, 120]], [7, [240, 210, 60]], [15, [240, 120, 40]], [30, [210, 40, 80]]] },
  wave: { unit: "m", stops: [[0, [40, 60, 150]], [0.5, [50, 120, 200]], [1, [40, 180, 190]], [1.5, [100, 210, 120]], [2.5, [240, 200, 60]], [3.5, [240, 120, 40]], [5, [200, 40, 90]]] },
};
function colorAt(scale, v) {
  const st = SCALES[scale].stops;
  if (v <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) {
    if (v <= st[i][0]) {
      const [a, ca] = st[i - 1], [b, cb] = st[i];
      const t = (v - a) / (b - a);
      return ca.map((c, k) => c + (cb[k] - c) * t);
    }
  }
  return st[st.length - 1][1];
}

const LAYERS = [
  { id: "wind", label: "Wind", icon: Wind, scale: "wind", particles: true },
  { id: "gust", label: "Gusts", icon: Gauge, scale: "gust", particles: true },
  { id: "rain", label: "Rain", icon: CloudRain, scale: "rain", particles: false },
  { id: "temp", label: "Temperature", icon: Thermometer, scale: "temp", particles: false },
  { id: "wave", label: "Waves", icon: Waves, scale: "wave", particles: false },
];

const N = 14; // grid points per side

/* ---------- data: one Open-Meteo request for a 9x9 grid, hourly for 48 h ---------- */
function useField(bbox) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!bbox) return;
    setData(null);
    setError("");
    const [s, w, n, e] = bbox;
    const padLat = 3.2, padLon = 5; // big box so the whole visible map is covered
    const lats = [], lons = [];
    for (let i = 0; i < N; i++) lats.push(+(n + padLat - (i * (n - s + 2 * padLat)) / (N - 1)).toFixed(3));
    for (let j = 0; j < N; j++) lons.push(+(w - padLon + (j * (e - w + 2 * padLon)) / (N - 1)).toFixed(3));
    const pts = lats.flatMap((la) => lons.map((lo) => [la, lo]));
    const common = { latitude: pts.map((p) => p[0]).join(","), longitude: pts.map((p) => p[1]).join(","), timezone: "Asia/Kolkata", forecast_days: 2 };
    Promise.allSettled([
      axios.get("https://api.open-meteo.com/v1/forecast", { params: { ...common, hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation" }, timeout: 20000 }),
      axios.get("https://marine-api.open-meteo.com/v1/marine", { params: { ...common, hourly: "wave_height" }, timeout: 20000 }),
    ]).then(([wx, sea]) => {
      if (wx.status !== "fulfilled") return setError("Live weather could not be loaded right now (Open-Meteo unreachable).");
      const arr = Array.isArray(wx.value.data) ? wx.value.data : [wx.value.data];
      const seaArr = sea.status === "fulfilled" ? (Array.isArray(sea.value.data) ? sea.value.data : [sea.value.data]) : [];
      const times = arr[0].hourly.time;
      const grab = (key, src = arr) => times.map((_, t) => src.map((loc) => loc?.hourly?.[key]?.[t] ?? null));
      setData({ lats, lons, times, wind: grab("wind_speed_10m"), dir: grab("wind_direction_10m"), gust: grab("wind_gusts_10m"),
        temp: grab("temperature_2m"), rain: grab("precipitation"), wave: seaArr.length ? grab("wave_height", seaArr) : null });
    });
  }, [bbox]);
  return { data, error };
}

// bilinear sample of a flat N*N array at lat/lon
function sample(field, lats, lons, lat, lon) {
  // outside the fetched box, use the nearest edge value so the whole view stays coloured
  const fi = Math.min(Math.max(((lats[0] - lat) / (lats[0] - lats[N - 1])) * (N - 1), 0), N - 1);
  const fj = Math.min(Math.max(((lon - lons[0]) / (lons[N - 1] - lons[0])) * (N - 1), 0), N - 1);
  const i = Math.min(Math.floor(fi), N - 2), j = Math.min(Math.floor(fj), N - 2);
  const di = fi - i, dj = fj - j;
  const v = [field[i * N + j], field[i * N + j + 1], field[(i + 1) * N + j], field[(i + 1) * N + j + 1]];
  if (v.some((x) => x === null || x === undefined)) {
    const ok = v.filter((x) => x !== null && x !== undefined);
    return ok.length >= 2 ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
  }
  return v[0] * (1 - di) * (1 - dj) + v[1] * (1 - di) * dj + v[2] * di * (1 - dj) + v[3] * di * dj;
}

/* ---------- canvas layer: colour field + wind particles ---------- */
function FieldCanvas({ data, t, layer }) {
  const map = useMap();
  const fieldRef = useRef(null);
  const partRef = useRef(null);
  const state = useRef({ data, t, layer });
  const redrawRef = useRef(null);
  state.current = { data, t, layer };

  useEffect(() => {
    // Our own map pane between the tiles (200) and the markers (600), so the weather sits ON the map
    const pane = map.getPane("wx") || map.createPane("wx");
    pane.style.zIndex = 450;
    pane.style.pointerEvents = "none";
    const mk = () => {
      const c = document.createElement("canvas");
      Object.assign(c.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
      pane.appendChild(c);
      return c;
    };
    fieldRef.current = mk();
    partRef.current = mk();
    const size = () => {
      const { x, y } = map.getSize();
      const origin = map.containerPointToLayerPoint([0, 0]);
      [fieldRef.current, partRef.current].forEach((c) => {
        c.width = x;
        c.height = y;
        L.DomUtil.setPosition(c, origin);
        c.style.opacity = 1;
      });
      drawField();
    };
    const hide = () => [fieldRef.current, partRef.current].forEach((c) => (c.style.opacity = 0));
    function drawField() {
      const { data: d, t: ti, layer: ly } = state.current;
      const c = fieldRef.current;
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      if (!d) return;
      const L_ = LAYERS.find((x) => x.id === ly);
      const grid = d[ly]?.[ti];
      if (!grid) return;
      const B = 6;
      for (let y = 0; y < c.height; y += B) {
        for (let x = 0; x < c.width; x += B) {
          const ll = map.containerPointToLatLng([x + B / 2, y + B / 2]);
          const v = sample(grid, d.lats, d.lons, ll.lat, ll.lng);
          if (v === null) continue;
          const col = colorAt(L_.scale, v);
          const a = col.length === 4 ? 0 : ly === "rain" ? Math.min(0.75, 0.15 + v / 6) : 0.55;
          if (a <= 0) continue;
          ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
          ctx.fillRect(x, y, B, B);
        }
      }
    }
    redrawRef.current = drawField;
    size();
    map.on("moveend zoomend resize", size);
    map.on("zoomstart", hide);

    // particles
    let parts = [];
    let raf;
    const reset = (p) => {
      p.x = Math.random() * partRef.current.width;
      p.y = Math.random() * partRef.current.height;
      p.age = Math.floor(Math.random() * 80);
    };
    for (let i = 0; i < 1400; i++) { const p = {}; reset(p); parts.push(p); }
    const step = () => {
      const c = partRef.current;
      const ctx = c.getContext("2d");
      const { data: d, t: ti, layer: ly } = state.current;
      const L_ = LAYERS.find((x) => x.id === ly);
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "rgba(0,0,0,0.94)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
      if (d && L_?.particles) {
        const sp = d[ly === "gust" ? "gust" : "wind"][ti];
        const dr = d.dir[ti];
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const p of parts) {
          const ll = map.containerPointToLatLng([p.x, p.y]);
          const s = sample(sp, d.lats, d.lons, ll.lat, ll.lng);
          const a = sample(dr, d.lats, d.lons, ll.lat, ll.lng);
          if (s === null || a === null || p.age++ > 70) { reset(p); continue; }
          const rad = (a * Math.PI) / 180; // direction the wind comes FROM
          const k = 0.25 + 0.03 * s;
          const nx = p.x - Math.sin(rad) * k, ny = p.y + Math.cos(rad) * k;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(nx, ny);
          p.x = nx; p.y = ny;
          if (nx < 0 || ny < 0 || nx > c.width || ny > c.height) reset(p);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend zoomend resize", size);
      map.off("zoomstart", hide);
      fieldRef.current?.remove();
      partRef.current?.remove();
    };
  }, [map]);

  useEffect(() => {
    redrawRef.current?.();
    const c = partRef.current;
    if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
  }, [data, t, layer]);
  return null;
}

/* ---------- value pill markers ---------- */
const pill = (text, title) => L.divIcon({ className: "wx-pill-wrap", html: `<div class="wx-pill"><b>${title}</b><span>${text}</span></div>`, iconSize: [0, 0] });

export default function WeatherField({ regionInfo, assets = [] }) {
  const bbox = regionInfo?.bbox;
  const { data, error } = useField(bbox);
  const [layer, setLayer] = useState("wind");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!data) return;
    const now = new Date();
    const idx = data.times.findIndex((x) => new Date(x) >= now);
    setT(Math.max(0, idx - 1));
  }, [data]);
  useEffect(() => {
    if (!playing || !data) return;
    const id = setInterval(() => setT((x) => (x + 1) % data.times.length), 450);
    return () => clearInterval(id);
  }, [playing, data]);

  const L_ = LAYERS.find((x) => x.id === layer);
  const pins = useMemo(() => {
    const out = [{ name: regionInfo?.short, lat: regionInfo?.center?.[0], lon: regionInfo?.center?.[1] }];
    const op = regionInfo?.ocean_point, c = regionInfo?.center;
    if (op && c) out.push({ name: "Out at sea", lat: c[0], lon: c[1] + Math.sign(op[1] - c[1]) * 0.7 });
    return out.filter((p) => p.lat);
  }, [regionInfo]);
  const valueAt = (p) => {
    if (!data || !data[layer]) return "–";
    const v = sample(data[layer][t], data.lats, data.lons, p.lat, p.lon);
    if (v === null) return "–";
    return `${layer === "wave" || layer === "rain" ? v.toFixed(1) : Math.round(v)} ${SCALES[L_.scale].unit}`;
  };
  const when = data ? new Date(data.times[t]).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const stops = SCALES[L_.scale].stops;

  return (
    <div className="wx">
      <div className="wx-tabs">
        {LAYERS.map((l) => {
          const I = l.icon;
          return <button key={l.id} className={layer === l.id ? "on" : ""} onClick={() => setLayer(l.id)} disabled={l.id === "wave" && data && !data.wave}><I size={15} /> {l.label}</button>;
        })}
      </div>
      <div className="wx-map">
        <MapContainer key={regionInfo?.id} center={regionInfo?.center || [13.05, 80.24]} zoom={(regionInfo?.zoom || 11) - 2.5} zoomSnap={0.25} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer className="dark-tiles" attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FieldCanvas data={data} t={t} layer={layer} />
          {assets.filter((f) => f.properties.risk_level !== "low").map((f) => (
            <Marker key={f.properties.id} position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]} icon={typeIcon(f.properties, "small")}>
              <Tooltip>{f.properties.name}: {valueAt({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] })}</Tooltip>
            </Marker>
          ))}
          {pins.map((p, i) => <Marker key={`pin-${i}`} position={[p.lat, p.lon]} icon={pill(valueAt(p), i === 0 ? p.name : p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name)} />)}
        </MapContainer>
        {!data && <div className="wx-loading">{error || "Loading live weather…"}</div>}
        <div className="wx-scale">
          <span>{SCALES[L_.scale].unit}</span>
          <i style={{ background: `linear-gradient(90deg, ${stops.map(([, c]) => `rgb(${c[0]},${c[1]},${c[2]})`).join(",")})` }}></i>
          <span>{stops[0][0]}–{stops[stops.length - 1][0]}</span>
        </div>
      </div>
      <div className="wx-time">
        <button className="primary-button inline" onClick={() => setPlaying(!playing)} disabled={!data}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <input type="range" min={0} max={data ? data.times.length - 1 : 0} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Forecast hour" />
        <b>{when}</b>
      </div>
      <p className="chart-source">Live forecast from Open-Meteo (free), a {N}×{N} grid of points, hourly for 48 h. Moving streaks show wind direction and speed. Shapes = our medium- and high-risk power assets.</p>
    </div>
  );
}
