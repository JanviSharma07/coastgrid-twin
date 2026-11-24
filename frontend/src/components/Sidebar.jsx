import {
  LayoutDashboard,
  Map,
  Waves,
  Activity,
  ShieldCheck,
  Settings,
  Zap,
  ChevronLeft
} from "lucide-react";

const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Digital Twin", icon: Map },
  { name: "Flood Intelligence", icon: Waves },
  { name: "Risk Analytics", icon: Activity },
  { name: "Safe Sites", icon: ShieldCheck },
  { name: "What-If Simulator", icon: Zap }
];

export default function Sidebar({ active, setActive }) {
  return (
    <aside className="sidebar">

      <div className="brand">
        <div className="brand-icon">
          <Waves size={25} />
        </div>

        <div>
          <h2>COASTGRID</h2>
          <span>CLIMATE INTELLIGENCE</span>
        </div>
      </div>

      <div className="workspace">
        <span className="workspace-dot"></span>
        LIVE MONITORING
      </div>

      <p className="nav-heading">WORKSPACE</p>

      <nav>
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.name}
              onClick={() => setActive(item.name)}
              className={`nav-item ${
                active === item.name ? "active" : ""
              }`}
            >
              <Icon size={19} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">

        <button className="nav-item">
          <Settings size={19} />
          Settings
        </button>

        <div className="team-card">
          <div className="team-avatar">TV</div>

          <div>
            <strong>Team TwinVolt</strong>
            <small>Climate Innovation</small>
          </div>

          <ChevronLeft size={17} />
        </div>

      </div>

    </aside>
  );
}