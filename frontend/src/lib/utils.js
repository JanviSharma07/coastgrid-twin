// Shared labels, colours and helpers used by every page.

export const SCENARIOS = [
  { id: "ssp126", label: "Low emissions (SSP1-2.6)", short: "low emissions", plain: "the world cuts pollution fast" },
  { id: "ssp245", label: "Intermediate (SSP2-4.5)", short: "intermediate emissions", plain: "the world continues roughly as today" },
  { id: "ssp585", label: "High emissions (SSP5-8.5)", short: "high emissions", plain: "pollution keeps rising (worst case)" },
];
export const YEARS = [2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100];
export const SURGES = [
  { value: 0.5, label: "High tide only (0.5 m)", short: "a normal high tide" },
  { value: 1.0, label: "Moderate storm (1.0 m)", short: "a moderate storm" },
  { value: 1.5, label: "Cyclone Vardah-like (1.5 m)", short: "a Cyclone Vardah-like storm" },
  { value: 2.0, label: "Severe cyclone (2.0 m)", short: "a severe cyclone" },
];
export const REGION = "chennai";

export const RISK_COLORS = { high: "#fb7185", medium: "#fbbf24", low: "#34d399" };
export const SAFE_COLOR = "#2dd4bf";
export const SINK_COLOR = "#c084fc";
export const FLOOD_COLOR = "#38bdf8";

export const TYPE_LABELS = {
  substation: "Substation",
  power_plant: "Power plant",
  solar: "Solar farm",
  battery: "Battery storage",
};

export const scenarioOf = (id) => SCENARIOS.find((s) => s.id === id) || SCENARIOS[1];
export const surgeOf = (v) => SURGES.find((s) => s.value === Number(v)) || SURGES[2];
export const typeLabel = (t) => TYPE_LABELS[t] || (t ? t.replace(/_/g, " ") : "Asset");

// Same cut-offs as the risk score (0.55 / 0.30) so colours mean the same thing everywhere.
export function band(score, model) {
  const hi = model?.high ?? 0.55;
  const med = model?.medium ?? 0.3;
  if (score >= hi) return "high";
  if (score >= med) return "medium";
  return "low";
}

export const floodYearText = (fy) => {
  if (fy === null || fy === undefined) return "after 2150";
  return fy <= new Date().getFullYear() ? `already (${fy})` : String(fy);
};

// Group the engine's recommended actions into budget categories.
export const ACTION_GROUPS = [
  { id: "raise", label: "Raise plinth or relocate", match: (a) => a.startsWith("Raise plinth") },
  { id: "wall", label: "Flood wall, waterproofing and pumps", match: (a) => a.startsWith("Flood wall") },
  { id: "plan", label: "Plan elevation in next upgrade", match: (a) => a.startsWith("Plan elevation") },
  { id: "salt", label: "Salt-resistant insulators + washing", match: (a) => a.startsWith("Salt-resistant") },
  { id: "heat", label: "Cooling upgrade + load management", match: (a) => a.startsWith("Cooling") },
  { id: "monitor", label: "Monitor (no spending now)", match: (a) => a.startsWith("Monitor") },
];
export const actionGroup = (action = "") => ACTION_GROUPS.find((g) => g.match(action))?.id || "monitor";

export function downloadText(filename, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(c.get(r))).join(","))].join("\n");
}

export const PRIORITY_COLUMNS = [
  { label: "Rank", get: (r) => r.rank },
  { label: "Name", get: (r) => r.name },
  { label: "Type", get: (r) => typeLabel(r.type) },
  { label: "Voltage (kV)", get: (r) => r.voltage_kv },
  { label: "Latitude", get: (r) => r.lat?.toFixed(5) },
  { label: "Longitude", get: (r) => r.lon?.toFixed(5) },
  { label: "Risk score (0-1)", get: (r) => r.risk_score },
  { label: "Risk level", get: (r) => r.risk_level },
  { label: "Flood score", get: (r) => r.flood_score },
  { label: "Heat score", get: (r) => r.heat_score },
  { label: "Salt score", get: (r) => r.salt_score },
  { label: "Water level (m)", get: (r) => r.water_level_m },
  { label: "Margin above water (m)", get: (r) => r.margin_m },
  { label: "First flood year", get: (r) => floodYearText(r.flood_year) },
  { label: "Main threat", get: (r) => r.main_threat },
  { label: "Recommended action", get: (r) => r.action },
];

export const storage = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  },
};
