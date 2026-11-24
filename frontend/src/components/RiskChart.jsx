import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

const data = [
  { year: "2030", low: 12, medium: 18, high: 25 },
  { year: "2040", low: 16, medium: 28, high: 40 },
  { year: "2050", low: 20, medium: 39, high: 58 },
  { year: "2060", low: 25, medium: 48, high: 70 },
  { year: "2070", low: 30, medium: 57, high: 82 },
  { year: "2080", low: 35, medium: 67, high: 92 },
  { year: "2090", low: 39, medium: 75, high: 100 },
  { year: "2100", low: 43, medium: 83, high: 110 }
];

export default function RiskChart() {
  return (
    <div className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h3>Climate Risk Projection</h3>
          <p>Illustrative scenario comparison</p>
        </div>

        <span className="live-tag">PROJECTION</span>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient
                id="highGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#fb7185"
                  stopOpacity={0.4}
                />

                <stop
                  offset="100%"
                  stopColor="#fb7185"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="#26374b"
              strokeDasharray="4 4"
            />

            <XAxis dataKey="year" stroke="#8294a9" />
            <YAxis stroke="#8294a9" />

            <Tooltip
              contentStyle={{
                background: "#101e30",
                border: "1px solid #30445c",
                borderRadius: "10px",
                color: "#fff"
              }}
            />

            <Area
              type="monotone"
              dataKey="high"
              stroke="#fb7185"
              fill="url(#highGradient)"
              strokeWidth={3}
            />

            <Area
              type="monotone"
              dataKey="medium"
              stroke="#38bdf8"
              fill="transparent"
              strokeWidth={2}
            />

            <Area
              type="monotone"
              dataKey="low"
              stroke="#34d399"
              fill="transparent"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend">
        <span><i className="high"></i> SSP585</span>
        <span><i className="medium"></i> SSP245</span>
        <span><i className="low"></i> SSP126</span>
      </div>
    </div>
  );
}