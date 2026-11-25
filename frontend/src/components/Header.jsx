import { useEffect, useState } from "react";
import { MapPin, UserRound, Sun, Moon } from "lucide-react";
import { storage } from "../lib/utils";
import { ROLES } from "../lib/utils";

export default function Header({ page, status, regions, region, setRegion, role, setRole }) {
  const [theme, setTheme] = useState(() => storage.get("cg-theme", "dark"));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set("cg-theme", theme);
  }, [theme]);
  const statusText = { ok: "Live data", waking: "Connecting…", down: "Server unreachable" }[status];
  return (
    <header className="header">
      <div>
        <div className="breadcrumb">COASTGRID TWIN / {page.name.toUpperCase()}</div>
        <h1>{page.title}</h1>
        <p>{page.subtitle}</p>
      </div>

      <div className="header-actions">
        <label className="header-select" title="Which coastal city">
          <MapPin size={15} />
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="City">
            {(regions.length ? regions : [{ id: "chennai", name: "Chennai, Tamil Nadu" }]).map((r) => (
              <option key={r.id} value={r.id}>{r.name}{r.built === null ? " (onboarding)" : ""}</option>
            ))}
          </select>
        </label>
        <label className="header-select" title="Show the screens for your job">
          <UserRound size={15} />
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Viewing as">
            <option value="">Viewing as: everyone</option>
            {ROLES.map((r) => <option key={r.id} value={r.id}>Viewing as: {r.name}</option>)}
          </select>
        </label>
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Light / dark mode">
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Light" : "Dark"}
        </button>
        <span className={`status-pill ${status}`} title="Connection to the CoastGrid Twin data server">
          <i></i> {statusText}
        </span>
      </div>
    </header>
  );
}
