import { Satellite, Ship, CloudSun, Cable, Cpu, Bell, ClipboardList, FileText } from "lucide-react";

// What feeds the twin. "live" = used in this prototype today; "planned" = integration on adoption.
const INPUTS = [
  {
    icon: Satellite, title: "Satellites",
    items: [
      ["Copernicus DEM: 30 m ground height", "live"],
      ["NOAA Coral Reef Watch: sea temperature & heatwaves", "live"],
      ["NISAR / Sentinel-1: land sinking (InSAR)", "planned"],
      ["Sentinel-6: sea-level altimetry", "planned"],
    ],
  },
  {
    icon: Ship, title: "Ocean & ships",
    items: [
      ["IPCC AR6 sea-level projections", "live"],
      ["INCOIS ocean buoys, tide gauges & storm-surge forecasts", "planned"],
      ["Indian Navy hydrographic surveys: coastal depth charts", "planned"],
      ["Research-vessel sea-level & temperature profiles", "planned"],
    ],
  },
  {
    icon: CloudSun, title: "Weather",
    items: [
      ["Open-Meteo 7-day forecast & marine waves", "live"],
      ["ERA5 wind, humidity & heat history", "live"],
      ["IMD cyclone bulletins & warnings", "planned"],
    ],
  },
  {
    icon: Cable, title: "Grid & city",
    items: [
      ["OpenStreetMap substations, plants, hospitals, neighbourhoods", "live"],
      ["Utility asset register with real plinth heights", "planned"],
      ["SCADA & substation water/temperature sensors", "planned"],
    ],
  },
];

const OUTPUTS = [
  [Bell, "Early warnings", "Storm Watch alerts before landfall"],
  [ClipboardList, "Ranked action plan", "What to fix, by when, at what cost"],
  [FileText, "Reports & open API", "For managers, regulators and other software"],
];

export default function DataNetwork() {
  return (
    <div className="net">
      <div className="net-inputs">
        {INPUTS.map(({ icon: Icon, title, items }) => (
          <div className="net-card" key={title}>
            <h4><Icon size={18} /> {title}</h4>
            <ul>
              {items.map(([t, s]) => (
                <li key={t}><span className={`tag ${s}`}>{s === "live" ? "LIVE" : "PLANNED"}</span>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="net-flow" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>

      <div className="net-core">
        <Cpu size={30} />
        <b>CoastGrid Twin</b>
        <small>re-runs the risk model for every asset × 3 emissions paths × 8 decades × 4 storm sizes</small>
      </div>

      <div className="net-flow" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>

      <div className="net-outputs">
        {OUTPUTS.map(([Icon, t, d]) => (
          <div className="net-out" key={t}>
            <Icon size={18} />
            <div><b>{t}</b><small>{d}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}
