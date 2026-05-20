import { useState, useEffect, useCallback } from "react";
import { listBuilds, setApiKey, type Build } from "./lib/api";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import SubmitBuild from "./components/SubmitBuild";
import BuildList from "./components/BuildList";
import BuildDetail from "./components/BuildDetail";
import AdminPanel from "./components/AdminPanel";
import "./App.css";

type Tab = "dashboard" | "submit" | "builds" | "admin";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [apiKey, setApiKeyState] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [builds, setBuilds] = useState<Build[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const isAdmin = apiKey === "fucking-admin-dtbuildkit" || localStorage.getItem("dtbuild_admin_key") === "fucking-admin-dtbuildkit";

  const refresh = useCallback(async () => {
    try {
      const list = await listBuilds();
      setBuilds(list);
    } catch {}
  }, []);

  useEffect(() => {
    if (loggedIn) {
      refresh();
      const t = setInterval(refresh, 5000);
      return () => clearInterval(t);
    }
  }, [loggedIn, refresh]);

  function handleLogin(key: string) {
    setApiKey(key);
    setApiKeyState(key);
    setLoggedIn(true);
  }

  if (!loggedIn) return <Login onLogin={handleLogin} />;

  return (
    <div className="app">
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h1>dtbuildkit</h1>
          <div className="tabs">
            {(["dashboard", "submit", "builds"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "dashboard" ? "Dashboard" : t === "submit" ? "Submit" : "Builds"}
              </button>
            ))}
            {isAdmin && (
              <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
                Admin
              </button>
            )}
          </div>
        </div>
        <div className="header-right">
          <button
            className="ghost"
            onClick={() => { localStorage.removeItem("dtbuild_api_key"); setLoggedIn(false); }}
            style={{ fontSize: 11, padding: "4px 10px" }}
          >
            Logout
          </button>
        </div>
      </header>

      <main className={tab === "dashboard" ? "dashboard-grid" : ""}>
        {tab === "dashboard" && <Dashboard />}

        {tab === "submit" && (
          <>
            <SubmitBuild onSubmitted={(b) => { setSelected(b.id); refresh(); setTab("builds"); }} />
            <div />
          </>
        )}

        {tab === "builds" && (
          <>
            <BuildList builds={builds} selected={selected} onSelect={setSelected} onRefresh={refresh} />
            <div>{selected && <BuildDetail id={selected} onClose={() => setSelected(null)} />}</div>
          </>
        )}

        {tab === "admin" && isAdmin && <AdminPanel />}
      </main>
    </div>
  );
}

export default App;
