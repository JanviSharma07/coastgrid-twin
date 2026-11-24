import { Activity, AlertTriangle, Waves, ShieldCheck, ArrowRight } from "lucide-react";
import StatCard from "../components/StatCard";
import AssetMap from "../components/AssetMap";
import RiskChart from "../components/RiskChart";
import { InfoBox, Panel, RiskBadge } from "../components/ui";
import { scenarioOf, surgeOf, floodYearText } from "../lib/utils";

export default function Overview(props) {
  const { summary, assets, priorities, safeSites, floodZones, seaLevel, scenario, year, surge, model, region, go } = props;
  const top = priorities[0];
  const atRisk = (summary.high ?? 0) + (summary.medium ?? 0);

  return (
    <div className="page">
      <InfoBox>
        This is the one-screen summary. Change the three boxes above and every number, colour and list below updates for
        that future. <b>Red</b> assets need action now, <b>amber</b> ones should go into upcoming plans, <b>green</b> ones
        only need monitoring.
      </InfoBox>

      {summary.total !== undefined && (
        <div className="plain-summary">
          <b>In plain words:</b> in <b>{year}</b>, if {scenarioOf(scenario).plain} and <b>{surgeOf(surge).short}</b> hits
          Chennai, about <b>{summary.flood_area_km2} km²</b> of land could be under sea water. <b>{atRisk}</b> of{" "}
          {summary.total} power assets are at medium or high risk ({summary.high} high).
          {top && (
            <> The first one to act on is <b>{top.name}</b> — water first reaches its equipment around{" "}
              <b>{floodYearText(top.flood_year)}</b>.</>
          )}
        </div>
      )}

      <section className="stats-grid">
        <StatCard title="Power assets tracked" value={summary.total ?? "--"}
          description="Substations, power plants, solar and battery sites" icon={Activity} />
        <StatCard title="High-risk assets" value={summary.high ?? "--"}
          description={summary.medium !== undefined ? `${summary.medium} medium · ${summary.low} low` : ""}
          icon={AlertTriangle} color="#fb7185" />
        <StatCard title="Land under sea water" value={summary.flood_area_km2 !== undefined ? `${summary.flood_area_km2} km²` : "--"}
          description={summary.assets_flooded !== undefined ? `${summary.assets_flooded} assets would have water at their base` : ""}
          icon={Waves} color="#38bdf8" />
        <StatCard title="Safe sites for solar" value={safeSites?.features?.length ?? "--"}
          description="High ground near the grid, dry even in 2100" icon={ShieldCheck} color="#2dd4bf" />
      </section>

      <section className="dashboard-grid">
        <Panel title="Coastal risk map" subtitle="Click a dot to open that asset"
          right={<button className="link-button small" onClick={() => go("map")}>Full map <ArrowRight size={13} /></button>}>
          <AssetMap assets={assets} floodZones={floodZones} safeSites={safeSites} model={model}
            layerKey={`${scenario}-${year}-${surge}`} center={region?.center} height={400}
            onSelect={(id) => go("asset", id)} />
        </Panel>

        <Panel title="How fast is the sea rising?" subtitle="Projected global-mean sea-level rise (IPCC AR6)">
          <RiskChart seaLevel={seaLevel} year={year} scenario={scenario} />
        </Panel>
      </section>

      <Panel title="Top 5: fix these first" subtitle="Ranked by risk score, which already weighs how many people depend on the asset"
        right={<button className="link-button small" onClick={() => go("priorities")}>Full list & budget <ArrowRight size={13} /></button>}>
        {priorities.length ? (
          <div className="priority-list">
            {priorities.slice(0, 5).map((item) => (
              <button className="priority-item as-button" key={item.id} onClick={() => go("asset", item.id)}>
                <span className="priority-number">{String(item.rank).padStart(2, "0")}</span>
                <div>
                  <h3>{item.name} <RiskBadge level={item.risk_level} /></h3>
                  <p>Risk {item.risk_score} · first flooded {floodYearText(item.flood_year)} · main threat: {item.main_threat}</p>
                  <p className="priority-action">{item.action}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-message">Priority data will appear when the server responds.</p>
        )}
      </Panel>
    </div>
  );
}
