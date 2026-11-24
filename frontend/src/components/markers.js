import L from "leaflet";
import { RISK_COLORS } from "../lib/utils";

// Shape + ring colour = what the asset is. Fill colour = how at-risk it is (red / amber / green).
export const TYPE_STYLE = {
  substation: { label: "Substation", shape: "circle", ring: "#e2e8f0" },
  power_plant: { label: "Power plant", shape: "square", ring: "#a78bfa" },
  solar: { label: "Solar farm", shape: "diamond", ring: "#facc15" },
  battery: { label: "Battery storage", shape: "hex", ring: "#22d3ee" },
};

const cache = new Map();
export function typeIcon(p, size, fill) {
  const t = TYPE_STYLE[p.type] || TYPE_STYLE.substation;
  const px = size === "small" ? 9 : size === "sel" ? 22 : p.voltage_kv >= 220 || p.type === "power_plant" ? 18 : p.voltage_kv >= 110 ? 15 : 12;
  const color = fill || RISK_COLORS[p.risk_level] || "#94a3b8";
  const key = `${t.shape}|${px}|${color}|${size}`;
  if (!cache.has(key)) {
    cache.set(key, L.divIcon({
      className: "gm-wrap",
      html: `<span class="gm gm-${t.shape}${size === "sel" ? " sel" : ""}" style="--s:${px}px;--f:${color};--r:${t.ring}"></span>`,
      iconSize: [px, px],
      iconAnchor: [px / 2, px / 2],
      popupAnchor: [0, -px / 2],
    }));
  }
  return cache.get(key);
}
