import { Search, Bell, CalendarDays } from "lucide-react";

export default function Header() {
  return (
    <header className="header">
      <div>
        <div className="breadcrumb">
          CLIMATE INTELLIGENCE / OVERVIEW
        </div>

        <h1>Coastal Grid Overview</h1>

        <p>
          Monitor vulnerabilities. Predict risks.
          Build resilient infrastructure.
        </p>
      </div>

      <div className="header-actions">
        <button className="icon-button">
          <Search size={19} />
        </button>

        <button className="icon-button">
          <Bell size={19} />
        </button>

        <button className="date-button">
          <CalendarDays size={17} />
          2026 Monitoring
        </button>

        <div className="profile">TV</div>
      </div>
    </header>
  );
}