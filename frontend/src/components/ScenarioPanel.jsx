import { useState } from "react";
import { simulateRisk } from "../services/api";
import { Zap, ArrowUp, LoaderCircle } from "lucide-react";

export default function ScenarioPanel({
  assets = [],
  scenario = "baseline",
  year = 2050,
}) {
  const [assetId, setAssetId] = useState("");
  const [raise, setRaise] = useState(1.5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const safeAssets = Array.isArray(assets) ? assets : [];

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
        surge: 1.5,
      });

      setResult(response.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to run simulation. Check backend connection."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="simulator">
      <div className="panel-heading">
        <div>
          <h3>Infrastructure What-If Simulator</h3>
          <p>Explore climate adaptation strategies</p>
        </div>
        <Zap color="#38bdf8" />
      </div>

      <label>Select infrastructure</label>

      <select
        value={assetId}
        onChange={(e) => setAssetId(e.target.value)}
      >
        <option value="">Choose an asset</option>

        {safeAssets.map((asset, index) => (
          <option key={asset.id || index} value={asset.id}>
            {asset.name || asset.properties?.name || `Asset ${index + 1}`}
          </option>
        ))}
      </select>

      {safeAssets.length === 0 && (
        <p className="empty-message">
          Infrastructure data will appear when available.
        </p>
      )}

      <div className="slider-heading">
        <label>Raise equipment base</label>
        <strong>{raise.toFixed(1)} metres</strong>
      </div>

      <input
        type="range"
        min="0"
        max="5"
        step="0.5"
        value={raise}
        onChange={(e) => setRaise(Number(e.target.value))}
      />

      <div className="slider-labels">
        <span>0 metres</span>
        <span>5 metres</span>
      </div>

      <button
        className="primary-button"
        onClick={runSimulation}
        disabled={loading || safeAssets.length === 0}
      >
        {loading ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowUp size={18} />
        )}

        {loading ? "Running Simulation..." : "Run Simulation"}
      </button>

      {error && <p className="error-message">{error}</p>}

      {result && (
        <div className="simulation-result">
          <span>SIMULATION RESULT</span>
          <h2>{result.years_gained ?? "Not available"}</h2>
          <p>Years of protection gained</p>
          <p>Risk reduction: {result.risk_reduction ?? "N/A"}</p>
        </div>
      )}
    </div>
  );
}