import { useEffect, useState } from "react";
import { simulateRisk } from "../services/api";
import { Zap, ArrowUp, LoaderCircle } from "lucide-react";

// assets: GeoJSON features from /api/risk (sorted highest risk first)
export default function ScenarioPanel({ assets = [], scenario, year, surge, selectedId }) {
  const [assetId, setAssetId] = useState("");
  const [raise, setRaise] = useState(1.5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Clicking an asset on the map selects it here
  useEffect(() => {
    if (selectedId) {
      setAssetId(selectedId);
      setResult(null);
    }
  }, [selectedId]);

  const runSimulation = async () => {
    if (!assetId) {
      setError("Please select an infrastructure asset.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      setResult(null);
      const response = await simulateRisk({
        asset_id: assetId,
        scenario,
        year: Number(year),
        raise_m: Number(raise),
        surge: Number(surge),
      });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail?.toString() || "Unable to run simulation. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  const gained = result?.years_gained;
  const headline =
    gained === null || gained === undefined
      ? "Not at risk"
      : gained === "beyond 2150"
        ? "Safe beyond 2150"
        : `+${gained} years`;

  return (
    <div className="simulator">
      <div className="panel-heading">
        <div>
          <h3>Raise an asset and see what changes</h3>
          <p>Tip: click a substation on the map to select it</p>
        </div>
        <Zap color="#38bdf8" />
      </div>

      <label>Select infrastructure</label>
      <select value={assetId} onChange={(e) => { setAssetId(e.target.value); setResult(null); }}>
        <option value="">Choose an asset</option>
        {assets.map((f) => (
          <option key={f.properties.id} value={f.properties.id}>
            {f.properties.name} · {f.properties.risk_level} ({f.properties.risk_score})
          </option>
        ))}
      </select>

      {assets.length === 0 && <p className="empty-message">Infrastructure data will appear when available.</p>}

      <div className="slider-heading">
        <label>Raise equipment base</label>
        <strong>{raise.toFixed(1)} metres</strong>
      </div>
      <input type="range" min="0" max="5" step="0.5" value={raise} onChange={(e) => setRaise(Number(e.target.value))} />
      <div className="slider-labels">
        <span>0 metres</span>
        <span>5 metres</span>
      </div>

      <button className="primary-button" onClick={runSimulation} disabled={loading || assets.length === 0}>
        {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowUp size={18} />}
        {loading ? "Running Simulation..." : "Run Simulation"}
      </button>

      {error && <p className="error-message">{error}</p>}

      {result && (
        <div className="simulation-result">
          <span>SIMULATION RESULT · {result.name}</span>
          <h2>{headline}</h2>
          <p>Flood year: {result.before.flood_year ?? "beyond 2150"} → {result.after.flood_year ?? "beyond 2150"}</p>
          <p>
            Risk in {result.year}: {result.before.risk_score} ({result.before.risk_level}) → {result.after.risk_score} (
            {result.after.risk_level})
          </p>
          <p>Action now: {result.after.action}</p>
        </div>
      )}
    </div>
  );
}
