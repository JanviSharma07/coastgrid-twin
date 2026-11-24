import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getTrends } from "../services/api";
import { SCENARIOS, TOOLTIP_STYLE, surgeOf } from "../lib/utils";

const SC_COLORS = { ssp126: "#34d399", ssp245: "#38bdf8", ssp585: "#fb7185" };

/** Three charts from /api/trends: flooded land, assets by risk level, people-facing exposure. */
export default function TrendCharts({ region, surge = 1.5, scenario = "ssp245" }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    getTrends({ region, surge }).then((r) => setRows(r.data.rows)).catch(() => setRows([]));
  }, [region, surge]);

  const byYear = useMemo(() => {
    const m = {};
    (rows || []).forEach((r) => {
      m[r.year] = m[r.year] || { year: r.year };
      m[r.year][r.scenario] = r.flood_area_km2;
    });
    return Object.values(m).sort((a, b) => a.year - b.year);
  }, [rows]);
  const levels = useMemo(() => (rows || []).filter((r) => r.scenario === scenario), [rows, scenario]);

  if (rows === null) return <p className="empty-message">Loading trends…</p>;
  if (!rows.length) return <p className="empty-message">Trend data appears once this city's data is built.</p>;

  return (
    <div className="card-grid three charts">
      <div className="chart-card">
        <h4>Land under sea water (km²)</h4>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={byYear} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#26374b" strokeDasharray="4 4" />
              <XAxis dataKey="year" stroke="#8294a9" fontSize={10} />
              <YAxis stroke="#8294a9" fontSize={10} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {SCENARIOS.map((s) => <Line key={s.id} dataKey={s.id} name={s.label.split(" (")[0]} stroke={SC_COLORS[s.id]} strokeWidth={s.id === scenario ? 3 : 1.5} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <small>With {surgeOf(surge).short}, by emissions path</small>
      </div>
      <div className="chart-card">
        <h4>Power assets by risk level</h4>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={levels} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#26374b" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="year" stroke="#8294a9" fontSize={10} />
              <YAxis stroke="#8294a9" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="high" name="High" stackId="a" fill="#fb7185" />
              <Bar dataKey="medium" name="Medium" stackId="a" fill="#fbbf24" />
              <Bar dataKey="low" name="Low" stackId="a" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <small>{SCENARIOS.find((s) => s.id === scenario)?.label}</small>
      </div>
      <div className="chart-card">
        <h4>What ends up in the water</h4>
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={levels} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#26374b" strokeDasharray="4 4" />
              <XAxis dataKey="year" stroke="#8294a9" fontSize={10} />
              <YAxis stroke="#8294a9" fontSize={10} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line dataKey="assets_flooded" name="Power assets" stroke="#fb7185" strokeWidth={2.5} />
              <Line dataKey="places_flooded" name="Neighbourhoods" stroke="#38bdf8" strokeWidth={2.5} />
              <Line dataKey="hospitals_flooded" name="Hospitals" stroke="#f472b6" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <small>Counted when sea water stands above the equipment / at the location</small>
      </div>
    </div>
  );
}
