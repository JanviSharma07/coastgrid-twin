import { HelpCircle } from "lucide-react";

export default function Header({ page, status, go }) {
  const statusText = { ok: "Live data connected", waking: "Connecting to server…", down: "Server unreachable" }[status];
  return (
    <header className="header">
      <div>
        <div className="breadcrumb">COASTGRID TWIN / {page.name.toUpperCase()}</div>
        <h1>{page.title}</h1>
        <p>{page.subtitle}</p>
      </div>

      <div className="header-actions">
        <span className={`status-pill ${status}`} title="Connection to the CoastGrid Twin data server">
          <i></i> {statusText}
        </span>
        {page.id !== "start" && (
          <button className="date-button" onClick={() => go("start")}>
            <HelpCircle size={17} />
            How to use
          </button>
        )}
      </div>
    </header>
  );
}
