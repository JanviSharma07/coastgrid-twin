import { useCallback, useEffect, useMemo, useState } from "react";

import Sidebar, { PAGES } from "./components/Sidebar";
import Header from "./components/Header";
import { Controls } from "./components/ui";

import Home from "./pages/Home";
import StormWatch from "./pages/StormWatch";
import FutureMap from "./pages/FutureMap";
import AreaPeople from "./pages/AreaPeople";
import MySubstation from "./pages/MySubstation";
import InvestmentPlan from "./pages/InvestmentPlan";
import SafeSites from "./pages/SafeSites";
import Evidence from "./pages/Evidence";

import { getMeta, getHealth, getRisk, getPriorities, getSafeSites, getFloodZones, getSeaLevel, getOcean, getAreaImpact } from "./services/api";
import { storage } from "./lib/utils";

import "./index.css";
import "./pages.css";

// Which shared controls each page shows (Storm Watch and Mission have their own)
const CONTROLS = {
  future: { year: false, surge: true },
  area: { year: true, surge: true },
  asset: { year: true, surge: true },
  plan: { year: true, surge: true },
  safe: { year: false, surge: false },
};

const pageFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return PAGES.some((p) => p.id === id) ? id : "home";
};

function App() {
  const [active, setActive] = useState(pageFromHash);
  const [region, setRegionState] = useState(() => storage.get("cg-region", "chennai"));
  const [role, setRoleState] = useState(() => storage.get("cg-role", ""));
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
  const [areaImpact, setAreaImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const setRegion = (r) => {
    setRegionState(r);
    storage.set("cg-region", r);
    setSelectedId("");
  };
  const setRole = (r) => {
    setRoleState(r);
    storage.set("cg-role", r);
  };
  const chooseRole = (r, page) => {
    setRole(r);
    go(page);
  };

  useEffect(() => {
    getHealth().then((r) => setStatus(r.data?.status === "ok" ? "ok" : "down")).catch(() => setStatus("down"));
    getMeta().then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  // Per-city data
  useEffect(() => {
    setSeaLevel(null);
    setOcean(null);
    getSeaLevel({ region }).then((r) => setSeaLevel(r.data)).catch(() => {});
    getOcean({ region }).then((r) => setOcean(r.data)).catch(() => {});
  }, [region]);

  useEffect(() => {
    setSafeSites(null);
    getSafeSites({ region, scenario }).then((r) => setSafeSites(r.data)).catch(() => {});
  }, [region, scenario]);

  // Data for the chosen future
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const params = { region, scenario, year, surge };
      const [r, p, f, a] = await Promise.allSettled([
        getRisk(params), getPriorities({ ...params, limit: 200 }), getFloodZones(params), getAreaImpact(params),
      ]);
      if (cancelled) return;
      setRisk(r.status === "fulfilled" ? r.value.data : null);
      setPriorities(p.status === "fulfilled" ? p.value.data.items || [] : []);
      setFloodZones(f.status === "fulfilled" ? f.value.data : null);
      setAreaImpact(a.status === "fulfilled" ? a.value.data : null);
      if (r.status === "fulfilled") setStatus("ok");
      else if (r.reason?.response?.status !== 503)
        setError("Could not reach the data server. It may be waking up; please refresh in a few seconds.");
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [region, scenario, year, surge]);

  useEffect(() => {
    if (priorities.length && !priorities.some((p) => p.id === selectedId)) setSelectedId(priorities[0].id);
  }, [priorities, selectedId]);

  const regions = useMemo(() => meta?.regions || [], [meta]);
  const regionInfo = regions.find((r) => r.id === region);
  const built = regionInfo ? regionInfo.built !== null : true;
  const model = useMemo(() => ({ ...(meta?.model || {}), high: meta?.model?.high ?? 0.55, medium: meta?.model?.medium ?? 0.3 }), [meta]);
  const page = PAGES.find((p) => p.id === active) || PAGES[0];
  const controls = CONTROLS[active];

  const shared = {
    meta, regions, region, regionInfo, built, model, risk, assets: risk?.features || [], summary: risk?.summary || {},
    priorities, safeSites, floodZones, seaLevel, ocean, areaImpact, scenario, year, surge, setScenario, setYear, setSurge,
    selectedId, setSelectedId, go, loading, role, chooseRole, setRegion,
  };

  const pages = {
    home: <Home {...shared} />,
    storm: <StormWatch {...shared} />,
    future: <FutureMap {...shared} />,
    area: <AreaPeople {...shared} />,
    asset: <MySubstation {...shared} />,
    plan: <InvestmentPlan {...shared} />,
    safe: <SafeSites {...shared} />,
    evidence: <Evidence {...shared} />,
  };

  return (
    <div className="app-layout">
      <Sidebar active={active} go={go} role={role} />

      <main className="main-content">
        <Header page={page} status={status} regions={regions} region={region} setRegion={setRegion} role={role} setRole={setRole} />

        <div className="dashboard-content">
          {!built && (
            <div className="onboarding-banner big">
              <div>
                <b>{regionInfo?.name} is being onboarded: its data has not been built yet.</b>
                <p>Maps, stations and plans for this city appear after its data run (one command, see Evidence & Data → Add a city).
                  The live weather on Storm Watch already works for every city.</p>
              </div>
              <button className="primary-button inline" onClick={() => setRegion("chennai")}>Switch to Chennai (live)</button>
            </div>
          )}
          {regionInfo?.notes?.length > 0 && built && (
            <div className="note-banner">
              <b>Calibration notes for {regionInfo.short}:</b> {regionInfo.notes.join(" ")}
            </div>
          )}

          {controls && (
            <Controls scenario={scenario} setScenario={setScenario} year={year} setYear={setYear}
              surge={surge} setSurge={setSurge} showYear={controls.year} showSurge={controls.surge} city={regionInfo?.short} />
          )}

          {error && <div className="error-banner">{error}</div>}
          {loading && controls && built && <div className="loading-message">Loading data for this future…</div>}

          {!built && ["future", "area", "asset", "plan", "safe"].includes(active) ? (
            <div className="empty-city">
              <h2>No data for {regionInfo?.short} yet</h2>
              <p>This screen needs the city's data run. Switch to Chennai to see it working, or open Storm Watch for {regionInfo?.short}'s live weather.</p>
              <div className="btn-row">
                <button className="primary-button inline" onClick={() => setRegion("chennai")}>Switch to Chennai</button>
                <button className="link-button" onClick={() => go("storm")}>Storm Watch for {regionInfo?.short}</button>
              </div>
            </div>
          ) : pages[active]}

          <footer className="dashboard-footer">
            <span>COASTGRID TWIN</span>
            <span>
              {regionInfo?.name || "Chennai, Tamil Nadu"} · Data: IPCC AR6 · Copernicus DEM · NOAA Coral Reef Watch · ERA5 ·
              Open-Meteo · OpenStreetMap ·{" "}
              <a href="#/evidence" onClick={(e) => { e.preventDefault(); go("evidence"); }}>sources & limits</a>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
