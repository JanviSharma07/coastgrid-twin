import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const SERIES = [
  { key: "ssp585", label: "High emissions (SSP5-8.5)", color: "#fb7185" },
  { key: "ssp245", label: "Intermediate (SSP2-4.5)", color: "#38bdf8" },
  { key: "ssp126", label: "Low emissions (SSP1-2.6)", color: "#34d399" },
];

// seaLevel: /api/sea-level response -> { series: { ssp126: [{year, p17, p50, p83}], ... }, source }
export default function RiskChart({ seaLevel, year, scenario }) {
  const s = seaLevel?.series || {};
  const years = (s.ssp245 || []).map((r) => r.year);
  const data = years.map((y, i) => {
    const row = { year: y };
    SERIES.forEach(({ key }) => {
      row[key] = s[key]?.[i]?.p50;
    });
    return row;
  });

  if (!data.length) {
    return <p className="empty-message">Sea-level data will appear when available.</p>;
  }

  return (
    <>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 24, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#26374b" strokeDasharray="4 4" />
            <XAxis dataKey="year" stroke="#8294a9" />
            <YAxis stroke="#8294a9" unit=" m" />
            <Tooltip
              formatter={(v, name) => [`${v} m`, SERIES.find((x) => x.key === name)?.label || name]}
              contentStyle={{ background: "#101e30", border: "1px solid #30445c", borderRadius: "10px", color: "#fff" }}
            />
            <ReferenceLine x={year} stroke="#2dd4bf" strokeDasharray="3 3" label={{ value: String(year), fill: "#2dd4bf", position: "top" }} />
            {SERIES.map(({ key, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={key === scenario ? 3.5 : 1.5}
                strokeOpacity={key === scenario ? 1 : 0.55}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend">
        {SERIES.map(({ key, label, color }) => (
          <span key={key}><i className="dot" style={{ background: color }}></i> {label}</span>
        ))}
      </div>
      <p className="chart-source">
        Median projected rise in metres (relative to 1995–2014). Source: {seaLevel?.source}
      </p>
    </>
  );
}
