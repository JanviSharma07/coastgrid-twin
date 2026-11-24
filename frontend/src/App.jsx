import { useCallback, useEffect, useMemo, useState } from "react";

import Sidebar, { PAGES } from "./components/Sidebar";
import Header from "./components/Header";
import { Controls } from "./components/ui";

import StartHere from "./pages/StartHere";
import Overview from "./pages/Overview";
import RiskMapPage from "./pages/RiskMapPage";
import AssetDetails from "./pages/AssetDetails";
import Priorities from "./pages/Priorities";
import WhatIf from "./pages/WhatIf";
import SafeSites from "./pages/SafeSites";
import Weather from "./pages/Weather";
import Reports from "./pages/Reports";
import HowItWorks from "./pages/HowItWorks";

import { getMeta, getHealth, getRisk, getPriorities, getSafeSites, getFloodZones, getSeaLevel, getOcean } from "./services/api";
import { REGION } from "./lib/utils";

import "./index.css";
import "./pages.css";

// Which pages use the scenario / year / storm controls
const CONTROLS = {
  overview: { year: true, surge: true },
  map: { year: true, surge: true },
  asset: { year: true, surge: true },
  priorities: { year: true, surge: true },
  whatif: { year: true, surge: true },
  safe: { year: false, surge: false },
  reports: { year: true, surge: true },
};

const pageFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return PAGES.some((p) => p.id === id) ? id : "start";
};

function App() {
  const [active, setActive] = useState(pageFromHash);
  const [scenario, setScenario] = useState("ssp245");
  const [year, setYear] = useState(2050);
  const [surge, setSurge] = useState(1.5);
  const [selectedId, setSelectedId] = useState("");

  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState("waking");
  const [risk, setRisk] = useState(null);
  const [priorities, setPriorities] = useState([]);
  const [safeSites, setSafeSites] = useState(null);
  const [floodZones, setFloodZones] = useState(null);
  const [seaLevel, setSeaLevel] = useState(null);
  const [ocean, setOcean] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Hash navigation so the browser back button and shared links work
  useEffect(() => {
    const onHash = () => setActive(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((id, assetId) => {
    if (assetId) setSelectedId(assetId);
    window.location.hash = `/${id}`;
    setActive(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Data that does not change with the controls
  useEffect(() => {
    getHealth()
      .then((r) => setStatus(r.data?.status === "ok" ? "ok" : "down"))
      .catch(() => setStatus("down"));
    getMeta().then((r) => setMeta(r.data)).catch(() => {});
    getSeaLevel({ region: REGION }).then((r) => setSeaLevel(r.data)).catch(() => {});
    getOcean({ region: REGION }).then((r) => setOcean(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    getSafeSites({ region: REGION, scenario }).then((r) => setSafeSites(r.data)).catch(() => {});
  }, [scenario]);

  // Data that depends on scenario / year / storm
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const params = { region: REGION, scenario, year, surge };
      const [r, p, f] = await Promise.allSettled([
        getRisk(params),
        getPriorities({ ...params, limit: 200 }),
        getFloodZones(params),
      ]);
      if (cancelled) return;
      if (r.status === "fulfilled") {
        setRisk(r.value.data);
        setStatus("ok");
      } else {
        setError("Could not reach the data server. It may be waking up; please refresh in a few seconds.");
      }
      if (p.status === "fulfilled") setPriorities(p.value.data.items || []);
      if (f.status === "fulfilled") setFloodZones(f.value.data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [scenario, year, surge]);

  // Default the selected asset to the top priority
  useEffect(() => {
    if (!selectedId && priorities.length) setSelectedId(priorities[0].id);
  }, [priorities, selectedId]);

  const region = meta?.regions?.[0];
  const model = useMemo(
    () => ({ ...(meta?.model || {}), high: meta?.model?.high ?? 0.55, medium: meta?.model?.medium ?? 0.3 }),
    [meta]
  );
  const page = PAGES.find((p) => p.id === active) || PAGES[0];
  const controls = CONTROLS[active];

  const shared = {
    meta, region, model, risk, assets: risk?.features || [], summary: risk?.summary || {}, priorities,
    safeSites, floodZones, seaLevel, ocean, scenario, year, surge, selectedId, setSelectedId, go, loading,
  };

  const pages = {
    start: <StartHere {...shared} />,
    overview: <Overview {...shared} />,
    map: <RiskMapPage {...shared} />,
    asset: <AssetDetails {...shared} />,
    priorities: <Priorities {...shared} />,
    whatif: <WhatIf {...shared} />,
    safe: <SafeSites {...shared} />,
    weather: <Weather {...shared} />,
    reports: <Reports {...shared} />,
    method: <HowItWorks {...shared} />,
  };

  return (
    <div className="app-layout">
      <Sidebar active={active} go={go} />

      <main className="main-content">
        <Header page={page} status={status} go={go} />

        <div className="dashboard-content">
          {controls && (
            <Controls
              scenario={scenario} setScenario={setScenario}
              year={year} setYear={setYear}
              surge={surge} setSurge={setSurge}
              showYear={controls.year} showSurge={controls.surge}
            />
          )}

          {error && <div className="error-banner">{error}</div>}
          {loading && controls && <div className="loading-message">Loading data for this future…</div>}

          {pages[active]}

          <footer className="dashboard-footer">
            <span>COASTGRID TWIN</span>
            <span>
              {region?.name || "Chennai, Tamil Nadu"} · Data: IPCC AR6 · Copernicus DEM · NOAA Coral Reef Watch · ERA5 ·
              Open-Meteo · OpenStreetMap ·{" "}
              <a href="#/method" onClick={(e) => { e.preventDefault(); go("method"); }}>sources & limits</a>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
