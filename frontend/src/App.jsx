import { useEffect, useState } from "react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatCard from "./components/StatCard";
import RiskChart from "./components/RiskChart";
import AssetMap from "./components/AssetMap";
import ScenarioPanel from "./components/ScenarioPanel";

import {
  getMeta,
  getHealth,
  getRisk,
  getPriorities,
  getSafeSites,
  getFloodZones,
} from "./services/api";

import "./index.css";

function App() {
  const [active, setActive] = useState("Overview");
  const [scenario, setScenario] = useState("baseline");
  const [year, setYear] = useState(2050);

  const [meta, setMeta] = useState(null);
  const [risk, setRisk] = useState(null);
  const [priorities, setPriorities] = useState([]);
  const [safeSites, setSafeSites] = useState([]);
  const [floodZones, setFloodZones] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError("");

      const results = await Promise.allSettled([
        getMeta(),
        getHealth(),
        getRisk({
          region: "chennai",
          scenario,
          year,
          surge: 1.5,
        }),
        getPriorities({
          region: "chennai",
          year,
        }),
        getSafeSites({
          region: "chennai",
        }),
        getFloodZones({
          region: "chennai",
          scenario,
          year,
        }),
      ]);

      if (results[0].status === "fulfilled") {
        setMeta(results[0].value.data);
      }

      if (results[2].status === "fulfilled") {
        setRisk(results[2].value.data);
      }

      if (results[3].status === "fulfilled") {
        const data = results[3].value.data;

        setPriorities(
          Array.isArray(data)
            ? data
            : data?.priorities || []
        );
      }

      if (results[4].status === "fulfilled") {
        const data = results[4].value.data;

        setSafeSites(
          Array.isArray(data)
            ? data
            : data?.safe_sites || []
        );
      }

      if (results[5].status === "fulfilled") {
        setFloodZones(results[5].value.data);
      }

      if (
        results[0].status === "rejected" &&
        results[2].status === "rejected"
      ) {
        setError(
          "Unable to connect to the backend. Please check that the API server is running."
        );
      }

      setLoading(false);
    }

    loadDashboard();
  }, [scenario, year]);

  const summary = risk?.summary || {};

  const features =
    risk?.assets?.features ||
    risk?.geojson?.features ||
    risk?.features ||
    floodZones?.features ||
    floodZones?.geojson?.features ||
    [];

  const assetList = Array.isArray(features) ? features : [];

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

              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="baseline">Baseline Scenario</option>
                <option value="moderate">Moderate Scenario</option>
                <option value="high">High Impact Scenario</option>
              </select>

              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                <option value="2030">2030</option>
                <option value="2050">2050</option>
                <option value="2070">2070</option>
                <option value="2100">2100</option>
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

            <StatCard
              title="Assets Monitored"
              value={
                summary.total_assets ??
                assetList.length
              }
              icon="activity"
            />

            <StatCard
              title="High Risk Assets"
              value={
                summary.high_risk ??
                summary.high_risk_assets ??
                "--"
              }
              icon="alert"
            />

            <StatCard
              title="Safe Sites"
              value={safeSites.length || "--"}
              icon="shield"
            />

            <StatCard
              title="Selected Year"
              value={year}
              icon="globe"
            />

          </section>

          {/* MAP AND CHART */}

          <section className="dashboard-grid">

            <div className="panel map-panel">

              <div className="panel-heading">

                <div>
                  <h2>Coastal Risk Map</h2>
                  <p>
                    Geospatial view of coastal flood exposure
                  </p>
                </div>

                <span className="live-badge">
                  ● LIVE DATA
                </span>

              </div>

              <AssetMap floodData={assetList} />

            </div>

            <div className="panel chart-panel">

              <div className="panel-heading">
                <div>
                  <h2>Climate Risk Outlook</h2>
                  <p>
                    Illustrative long-term risk trend
                  </p>
                </div>
              </div>

              <RiskChart />

            </div>

          </section>

          {/* PRIORITIES AND SIMULATOR */}

          <section className="bottom-grid">

            <div className="panel priorities-panel">

              <div className="panel-heading">
                <div>
                  <h2>Priority Risk Areas</h2>
                  <p>
                    Areas requiring attention
                  </p>
                </div>
              </div>

              {priorities.length > 0 ? (

                <div className="priority-list">

                  {priorities.slice(0, 5).map((item, index) => (

                    <div
                      className="priority-item"
                      key={item.id || index}
                    >

                      <span className="priority-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div>

                        <h3>
                          {item.name ||
                            item.asset_name ||
                            `Risk Area ${index + 1}`}
                        </h3>

                        <p>
                          Risk score:{" "}
                          {item.risk_score ?? item.score ?? "N/A"}
                        </p>

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
                    Explore possible risk reduction scenarios
                  </p>
                </div>
              </div>

              <ScenarioPanel
                assets={assetList}
                scenario={scenario}
                year={year}
              />

            </div>

          </section>

          {/* FOOTER */}

          <footer className="dashboard-footer">

            <span>COASTGRID TWIN</span>

            <span>
              {meta?.region || "Chennai Coastal Region"}
              {" · "}
              Climate Intelligence
            </span>

          </footer>

        </div>

      </main>

    </div>
  );
}

export default App;