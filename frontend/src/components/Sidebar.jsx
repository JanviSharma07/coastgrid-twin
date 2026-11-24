import {
  Compass,
  LayoutDashboard,
  Map,
  Zap,
  ListOrdered,
  ShieldCheck,
  SlidersHorizontal,
  CloudRain,
  FileText,
  BookOpen,
  Waves,
} from "lucide-react";

export const PAGES = [
  { id: "start", name: "Start here", icon: Compass, group: "Get started", title: "Welcome to CoastGrid Twin", subtitle: "What this tool is, who it is for and how to use it in 3 steps" },
  { id: "overview", name: "Overview", icon: LayoutDashboard, group: "See the risk", title: "City overview", subtitle: "The whole picture for the future you pick, in one screen" },
  { id: "map", name: "Risk Map", icon: Map, group: "See the risk", title: "Risk map", subtitle: "Every power asset, flooded land, sinking ground and safe sites" },
  { id: "asset", name: "Asset Details", icon: Zap, group: "See the risk", title: "Asset details", subtitle: "One substation or plant explained: when water reaches it and why" },
  { id: "priorities", name: "Priorities & Budget", icon: ListOrdered, group: "Decide & plan", title: "Priorities & budget", subtitle: "What to fix first, when money is needed and what your budget covers" },
  { id: "whatif", name: "What-If Simulator", icon: SlidersHorizontal, group: "Decide & plan", title: "What-if simulator", subtitle: "Test an upgrade before spending money on it" },
  { id: "safe", name: "Safe Sites", icon: ShieldCheck, group: "Decide & plan", title: "Safe sites for new solar + battery", subtitle: "High ground near the grid that stays dry in the worst case" },
  { id: "weather", name: "Weather & Alerts", icon: CloudRain, group: "Prepare", title: "Weather & alerts", subtitle: "This week's forecast, sea heat and a precautions checklist" },
  { id: "reports", name: "Reports & API", icon: FileText, group: "Prepare", title: "Reports & data", subtitle: "Download, print or connect your own systems" },
  { id: "method", name: "How it works", icon: BookOpen, group: "About", title: "How it works", subtitle: "Data sources, the risk formula in plain words, and limitations" },
];

export default function Sidebar({ active, go }) {
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Waves size={25} />
        </div>
        <div>
          <h2>COASTGRID</h2>
          <span>TWIN · CHENNAI PILOT</span>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g}>
          <p className="nav-heading">{g.toUpperCase()}</p>
          <nav>
            {PAGES.filter((p) => p.group === g).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className={`nav-item ${active === item.id ? "active" : ""}`}
                  title={item.name}
                  aria-current={active === item.id ? "page" : undefined}
                >
                  <Icon size={19} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="sidebar-bottom">
        <div className="team-card">
          <div className="team-avatar">TV</div>
          <div>
            <strong>Team TwinVolt</strong>
            <small>Electroblitz Ideathon 2026</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
