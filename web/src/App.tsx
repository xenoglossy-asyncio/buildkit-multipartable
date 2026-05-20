import { useState, useEffect, useCallback } from "react";
import { listBuilds, setApiKey, type Build } from "./lib/api";
import SubmitBuild from "./components/SubmitBuild";
import BuildList from "./components/BuildList";
import BuildDetail from "./components/BuildDetail";
import AdminPanel from "./components/AdminPanel";
import "./App.css";

function App() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiKey, setApiKeyState] = useState(
    () => localStorage.getItem("dtbuild_api_key") || "",
  );
  const [showAdmin, setShowAdmin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listBuilds();
      setBuilds(list);
    } catch {
      // server not reachable yet
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="app">
      <header>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1>dtbuildkit</h1>
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              background: showAdmin ? "#f85149" : "#30363d",
            }}
          >
            {showAdmin ? "Exit Admin" : "Admin"}
          </button>
        </div>
        {!showAdmin && (
          <div className="apikey-box">
            <input
              type="password"
              placeholder="API key"
              value={apiKey}
              onChange={(e) => {
                setApiKeyState(e.target.value);
                setApiKey(e.target.value);
              }}
            />
          </div>
        )}
      </header>
      <main>
        {showAdmin ? (
          <AdminPanel />
        ) : (
          <>
            <SubmitBuild
              onSubmitted={(b) => {
                setSelected(b.id);
                refresh();
              }}
            />
            <div>
              <BuildList
                builds={builds}
                selected={selected}
                onSelect={setSelected}
                onRefresh={refresh}
              />
              {selected && (
                <BuildDetail
                  id={selected}
                  onClose={() => setSelected(null)}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
