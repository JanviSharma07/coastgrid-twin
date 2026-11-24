import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Waves, ShieldCheck } from "lucide-react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatCard from "./components/StatCard";
import RiskChart from "./components/RiskChart";
import AssetMap from "./components/AssetMap";
import ScenarioPanel from "./components/ScenarioPanel";

import {
  getMeta,
  getRisk,
  getPriorities,
  getSafeSites,
  getFloodZones,
  getSeaLevel,
} from "./services/api";

import "./index.css";

const SCENARIOS = [
  { id: "ssp126", label: "Low emissions (SSP1-2.6)" },
  { id: "ssp245", label: "Intermediate (SSP2-4.5)" },
  { id: "ssp585", label: "High emissions (SSP5-8.5)" },
];
const YEARS = [2030, 2040, 2050, 2060, 2070, 2080, 2090, 2100];
const SURGES = [
  { value: 0.5, label: "High tide only (0.5 m)" },
  { value: 1.0, label: "Moderate storm (1.0 m)" },
  { value: 1.5, label: "Cyclone Vardah-like (1.5 m)" },
  { value: 2.0, label: "Severe cyclone (2.0 m)" },
];
const REGION = "chennai";

function App() {
  const [active, setActive] = useState("Overview");
  const [scenario, setScenario] = useState("ssp245");
  const [year, setYear] = useState(2050);
  const [surge, setSurge] = useState(1.5);
  const [selectedId, setSelectedId] = useState("");

  const [meta, setMeta] = useState(null);
  const [risk, setRisk] = useState(null);
  const [priorities, setPriorities] = useState([]);
  const [safeSites, setSafeSites] = useState(null);
  const [floodZones, setFloodZones] = useState(null);
  const [seaLevel, setSeaLevel] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Data that does not change with the controls
  useEffect(() => {
    getMeta().then((r) => setMeta(r.data)).catch(() => {});
    getSeaLevel({ region: REGION }).then((r) => setSeaLevel(r.data)).catch(() => {});
  }, []);

  // Data that depends on scenario / year / surge
  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError("");
      const params = { region: REGION, scenario, year, surge };
      const [r, p, s, f] = await Promise.allSettled([
        getRisk(params),
        getPriorities({ ...params, limit: 10 }),
        getSafeSites({ region: REGION, scenario }),
        getFloodZones(params),
      ]);
      if (r.status === "fulfilled") setRisk(r.value.data);
      if (p.status === "fulfilled") setPriorities(p.value.data.items || []);
      if (s.status === "fulfilled") setSafeSites(s.value.data);
      if (f.status === "fulfilled") setFloodZones(f.value.data);
      if (r.status === "rejected") {
        setError("Unable to connect to the backend. The server may be waking up; please refresh in a few seconds.");
      }
      setLoading(false);
    }
    loadDashboard();
  }, [scenario, year, surge]);

  const summary = risk?.summary || {};
  const assetList = useMemo(() => risk?.features || [], [risk]);
  const scenarioLabel = SCENARIOS.find((x) => x.id === scenario)?.label;

  return (
    <div className="app-layout">

      <Sidebar
        active={active}
        setActive={setActive}
      />

      <main className="main-content">

        <Header />

        <div className="dashboard-content">

          {/* PAGE HEADER */}

          <div className="page-heading">

            <div>
              <p className="eyebrow">
                COASTAL INTELLIGENCE PLATFORM
              </p>

              <h1>CoastGrid Twin</h1>

              <p className="subtitle">
                Climate risk intelligence and coastal resilience dashboard
              </p>
            </div>

            <div className="control-group">
              <select value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Emissions scenario">
                {SCENARIOS.map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))}
              </select>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select value={surge} onChange={(e) => setSurge(Number(e.target.value))} aria-label="Storm surge">
                {SURGES.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </select>
            </div>

          </div>

          {/* ERROR AND LOADING */}

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          {loading && (
            <div className="loading-message">
              Loading coastal intelligence data...
            </div>
          )}

          {/* STATISTICS */}

          <section className="stats-grid">
            <StatCard title="Assets Monitored" value={summary.total ?? "--"}
              description="Substations, plants, solar and battery sites" icon={Activity} />
            <StatCard title="High Risk Assets" value={summary.high ?? "--"}
              description={summary.medium !== undefined ? `${summary.medium} medium · ${summary.low} low` : ""}
              icon={AlertTriangle} color="#fb7185" />
            <StatCard title="Flooded Area" value={summary.flood_area_km2 !== undefined ? `${summary.flood_area_km2} km²` : "--"}
              description={`${scenarioLabel}, ${year}, ${surge} m surge`} icon={Waves} color="#38bdf8" />
            <StatCard title="Safe Solar Sites" value={safeSites?.features?.length ?? "--"}
              description="High ground near the grid" icon={ShieldCheck} color="#2dd4bf" />
          </section>

          {/* MAP AND CHART */}

          <section className="dashboard-grid">

            <div className="panel map-panel">

              <div className="panel-heading">

                <div>
                  <h2>Coastal Risk Map</h2>
                  <p>
                    Flood area and every power asset coloured by risk · click a dot for details
                  </p>
                </div>

                <span className="live-badge">
                  ● LIVE DATA
                </span>

              </div>

              <AssetMap
                riskData={risk}
                floodZones={floodZones}
                safeSites={safeSites}
                layerKey={`${scenario}-${year}-${surge}`}
                onSelect={setSelectedId}
              />

            </div>

            <div className="panel chart-panel">

              <div className="panel-heading">
                <div>
                  <h2>Sea-Level Rise Outlook</h2>
                  <p>
                    IPCC AR6 projections by emissions scenario
                  </p>
                </div>
              </div>

              <RiskChart seaLevel={seaLevel} year={year} scenario={scenario} />

            </div>

          </section>

          {/* PRIORITIES AND SIMULATOR */}

          <section className="bottom-grid">

            <div className="panel priorities-panel">

              <div className="panel-heading">
                <div>
                  <h2>Priority Action List</h2>
                  <p>
                    Where to spend first, ranked by risk × criticality
                  </p>
                </div>
              </div>

              {priorities.length > 0 ? (

                <div className="priority-list">

                  {priorities.slice(0, 6).map((item) => (
                    <div
                      className="priority-item"
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <span className="priority-number">
                        {String(item.rank).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>
                          {item.name}{" "}
                          <span className={`risk-badge ${item.risk_level}`}>{item.risk_level}</span>
                        </h3>
                        <p>
                          Risk {item.risk_score} · Flood year {item.flood_year ?? "beyond 2150"} · Main threat {item.main_threat}
                        </p>
                        <p className="priority-action">{item.action}</p>
                      </div>
                    </div>
                  ))}
                </div>

              ) : (

                <p className="empty-message">
                  Priority data will appear when available.
                </p>

              )}

            </div>

            <div className="panel simulator-panel">

              <div className="panel-heading">
                <div>
                  <h2>What-If Simulator</h2>
                  <p>
                    Test an upgrade before spending money on it
                  </p>
                </div>
              </div>

              <ScenarioPanel
                assets={assetList}
                scenario={scenario}
                year={year}
                surge={surge}
                selectedId={selectedId}
              />

            </div>

          </section>

          {/* FOOTER */}

          <footer className="dashboard-footer">

            <span>COASTGRID TWIN</span>

            <span>
              {meta?.regions?.[0]?.name || "Chennai, Tamil Nadu"}
              {" · "}
              Data: IPCC AR6 · Copernicus DEM · NOAA CRW · ERA5 · OpenStreetMap
            </span>

          </footer>

        </div>

      </main>

    </div>
  );
}

export default App;