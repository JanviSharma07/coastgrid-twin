import { Home, CloudLightning, PlayCircle, Users, Zap, Wallet, ShieldCheck, FileCheck2, Waves } from "lucide-react";
import { roleOf } from "../lib/utils";

export const PAGES = [
  { id: "home", name: "Mission", icon: Home, title: "Know before the sea does",
    subtitle: "Why coastal grids need a digital twin, and what it does for a state" },
  { id: "storm", name: "Storm Watch", icon: CloudLightning, title: "Storm Watch",
    subtitle: "This week's weather, a cyclone replay and what to do before landfall" },
  { id: "future", name: "Future Map", icon: PlayCircle, title: "Future Map",
    subtitle: "Press play and watch the sea reach the grid, decade by decade" },
  { id: "area", name: "Area & People", icon: Users, title: "Area & People",
    subtitle: "Beyond the power stations: neighbourhoods and hospitals in the water's path" },
  { id: "asset", name: "My Substation", icon: Zap, title: "My Substation",
    subtitle: "One site, explained: until when it's safe, why, and how to fix it" },
  { id: "plan", name: "Investment Plan", icon: Wallet, title: "Investment & Execution Plan",
    subtitle: "What to fix first, what it costs, who pays, and progress on the ground" },
  { id: "safe", name: "Safe Sites", icon: ShieldCheck, title: "Safe Sites for New Solar + Battery",
    subtitle: "High ground near the grid that stays dry even in the worst case" },
  { id: "evidence", name: "Evidence & Data", icon: FileCheck2, title: "Evidence & Data",
    subtitle: "How every number is made, where it comes from, its limits, and the open API" },
];

export default function Sidebar({ active, go, role }) {
  const r = roleOf(role);
  const mine = r ? r.pages : [];
  const Item = (item) => {
    const Icon = item.icon;
    return (
      <button key={item.id} onClick={() => go(item.id)} title={item.name}
        className={`nav-item ${active === item.id ? "active" : ""}`} aria-current={active === item.id ? "page" : undefined}>
        <Icon size={19} />
        <span>{item.name}</span>
        {mine.includes(item.id) && <i className="nav-mark" title={`Recommended for ${r.name}`}></i>}
      </button>
    );
  };
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon"><Waves size={25} /></div>
        <div>
          <h2>COASTGRID</h2>
          <span>TWIN</span>
        </div>
      </div>

      {r && (
        <>
          <p className="nav-heading">FOR {r.name.toUpperCase()}</p>
          <nav>{PAGES.filter((p) => mine.includes(p.id)).map(Item)}</nav>
        </>
      )}
      <p className="nav-heading">{r ? "EVERYTHING ELSE" : "SCREENS"}</p>
      <nav>{PAGES.filter((p) => !mine.includes(p.id)).map(Item)}</nav>

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
