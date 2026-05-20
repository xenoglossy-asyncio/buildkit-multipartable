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

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "submit", label: "Submit" },
  { key: "builds", label: "Builds" },
];

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [builds, setBuilds] = useState<Build[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setBuilds(await listBuilds());
    } catch {}
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [loggedIn, refresh]);

  function handleLogin(key: string, admin: boolean) {
    setApiKey(key);
    setIsAdmin(admin);
    setLoggedIn(true);
  }

  if (!loggedIn) return <Login onLogin={handleLogin} />;

  return (
    <div className="app">
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h1>dtbuildkit</h1>
          <div className="tabs">
            {TABS.map(({ key, label }) => (
              <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
            {isAdmin && (
              <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
                Admin
              </button>
            )}
          </div>
        </div>
        <button className="ghost logout-btn" onClick={() => { localStorage.removeItem("dtbuild_api_key"); setLoggedIn(false); }}>
          Logout
        </button>
      </header>

      <main className={tab === "dashboard" ? "dashboard-grid" : ""}>
        {tab === "dashboard" && <Dashboard />}

        {tab === "submit" && (
          <SubmitBuild onSubmitted={(b) => { setSelected(b.id); refresh(); setTab("builds"); }} />
        )}

        {tab === "builds" && (
          <>
            <BuildList builds={builds} selected={selected} onSelect={setSelected} onRefresh={refresh} />
            {selected && <BuildDetail id={selected} onClose={() => setSelected(null)} />}
          </>
        )}

        {tab === "admin" && isAdmin && <AdminPanel />}
      </main>
    </div>
  );
}

export default App;
