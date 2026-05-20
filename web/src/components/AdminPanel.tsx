import { useState, useEffect, useCallback } from "react";

const BASE = "/api/v1/admin";

function headers(): Record<string, string> {
  const key = localStorage.getItem("dtbuild_admin_key") || "";
  return key ? { "X-Admin-Key": key } : {};
}

interface Health {
  db_ok: boolean;
  pending_builds: number;
  active_workers: number;
  queue_depth: number;
}

interface Stats {
  total_builds: number;
  succeeded: number;
  failed: number;
  success_rate: number;
  pending: number;
  active_workers: number;
}

interface Quota {
  user_id: string;
  max_concurrent: number;
  max_daily: number;
  max_storage_bytes: number;
  max_timeout_sec: number;
}

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState(
    () => localStorage.getItem("dtbuild_admin_key") || "",
  );
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [quotaUser, setQuotaUser] = useState("");
  const [quota, setQuota] = useState<Quota | null>(null);
  const [quotaForm, setQuotaForm] = useState({
    max_concurrent: 5,
    max_daily: 100,
    max_storage_bytes: 0,
    max_timeout_sec: 1800,
  });
  const [newKeyUser, setNewKeyUser] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keys, setKeys] = useState<{ user_id: string; key: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  const fetchJSON = useCallback(
    async (path: string, init?: RequestInit) => {
      const h = headers();
      if (!h["X-Admin-Key"]) throw new Error("No admin key");
      const res = await fetch(BASE + path, {
        ...init,
        headers: { ...h, ...((init?.headers as Record<string, string>) || {}) },
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
          setLoggedIn(false);
        }
        throw new Error(await res.text());
      }
      return res.json();
    },
    [],
  );

  const login = useCallback(() => {
    localStorage.setItem("dtbuild_admin_key", adminKey);
    setLoggedIn(true);
  }, [adminKey]);

  const loadAll = useCallback(async () => {
    try {
      const [h, s, k] = await Promise.all([
        fetchJSON("/health"),
        fetchJSON("/stats"),
        fetchJSON("/keys"),
      ]);
      setHealth(h);
      setStats(s);
      setKeys(k);
      setMsg("");
    } catch (e: any) {
      setMsg(e.message);
    }
  }, [fetchJSON]);

  useEffect(() => {
    if (adminKey) {
      login();
    }
  }, []);

  useEffect(() => {
    if (loggedIn) {
      loadAll();
      const t = setInterval(loadAll, 10000);
      return () => clearInterval(t);
    }
  }, [loggedIn, loadAll]);

  async function loadQuota() {
    if (!quotaUser) return;
    try {
      const q = await fetchJSON(`/quotas/${quotaUser}`);
      setQuota(q);
      setQuotaForm({
        max_concurrent: q.max_concurrent,
        max_daily: q.max_daily,
        max_storage_bytes: q.max_storage_bytes,
        max_timeout_sec: q.max_timeout_sec,
      });
    } catch {
      setQuota(null);
      setMsg("Quota not found for " + quotaUser);
    }
  }

  async function saveQuota() {
    try {
      await fetchJSON(`/quotas/${quotaUser}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...quotaForm,
          max_storage_bytes: Number(quotaForm.max_storage_bytes),
        }),
      });
      setMsg("Quota saved");
      loadQuota();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function deleteQuota() {
    try {
      await fetchJSON(`/quotas/${quotaUser}`, { method: "DELETE" });
      setQuota(null);
      setMsg("Quota deleted (reset to unlimited)");
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function createKey() {
    if (!newKeyUser) return;
    try {
      const r = await fetchJSON("/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: newKeyUser }),
      });
      setNewKey(r.api_key);
      setMsg(`API key created for ${newKeyUser}`);
      loadAll();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  async function revokeKey(uid: string) {
    try {
      await fetchJSON(`/keys/${uid}`, { method: "DELETE" });
      setMsg(`Key revoked for ${uid}`);
      loadAll();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  if (!loggedIn) {
    return (
      <div className="card">
        <h2>Admin Login</h2>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            type="password"
            placeholder="Admin key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            style={{ flex: 1 }}
          />
          <button onClick={login}>Login</button>
        </div>
        {msg && <div className="error">{msg}</div>}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2>Admin Panel</h2>
        <button
          onClick={() => {
            setLoggedIn(false);
            setAdminKey("");
            localStorage.removeItem("dtbuild_admin_key");
          }}
          style={{ background: "#30363d", fontSize: 12 }}
        >
          Logout
        </button>
      </div>

      {msg && (
        <div
          className="card"
          style={{
            padding: "8px 16px",
            marginBottom: 12,
            background: msg.includes("saved") || msg.includes("created")
              ? "rgba(63,185,80,0.1)"
              : "rgba(248,81,73,0.1)",
          }}
        >
          {msg}
        </div>
      )}

      {/* Health + Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <h2>System Health</h2>
          {health && (
            <div style={{ fontSize: 13 }}>
              <div className="stat-row"><span>DB</span><span style={{color: "#3fb950"}}>online</span></div>
              <div className="stat-row"><span>Active Workers</span><span>{health.active_workers}</span></div>
              <div className="stat-row"><span>Pending Builds</span><span>{health.pending_builds}</span></div>
              <div className="stat-row"><span>Queue Depth</span><span>{health.queue_depth}</span></div>
            </div>
          )}
        </div>
        <div className="card">
          <h2>Stats</h2>
          {stats && (
            <div style={{ fontSize: 13 }}>
              <div className="stat-row"><span>Total Builds</span><span>{stats.total_builds}</span></div>
              <div className="stat-row"><span>Succeeded</span><span style={{color: "#3fb950"}}>{stats.succeeded}</span></div>
              <div className="stat-row"><span>Failed</span><span style={{color: "#f85149"}}>{stats.failed}</span></div>
              <div className="stat-row"><span>Success Rate</span><span>{stats.success_rate.toFixed(1)}%</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Quota Management */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Quota Management</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            placeholder="User ID"
            value={quotaUser}
            onChange={(e) => setQuotaUser(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={loadQuota}>Load</button>
        </div>
        {quota !== undefined && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <label className="qlabel">
                Max Concurrent
                <input
                  type="number"
                  value={quotaForm.max_concurrent}
                  onChange={(e) =>
                    setQuotaForm({
                      ...quotaForm,
                      max_concurrent: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="qlabel">
                Max Daily
                <input
                  type="number"
                  value={quotaForm.max_daily}
                  onChange={(e) =>
                    setQuotaForm({
                      ...quotaForm,
                      max_daily: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="qlabel">
                Max Storage (bytes)
                <input
                  type="number"
                  value={quotaForm.max_storage_bytes}
                  onChange={(e) =>
                    setQuotaForm({
                      ...quotaForm,
                      max_storage_bytes: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="qlabel">
                Max Timeout (sec)
                <input
                  type="number"
                  value={quotaForm.max_timeout_sec}
                  onChange={(e) =>
                    setQuotaForm({
                      ...quotaForm,
                      max_timeout_sec: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="row">
              <button onClick={saveQuota}>Save Quota</button>
              <button
                className="danger"
                onClick={deleteQuota}
                style={{ background: "#30363d" }}
              >
                Reset to Unlimited
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>API Keys</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            placeholder="User ID"
            value={newKeyUser}
            onChange={(e) => setNewKeyUser(e.target.value)}
            style={{ flex: 1 }}
          />
          <button onClick={createKey}>Create Key</button>
        </div>
        {newKey && (
          <div
            style={{
              background: "#0d1117",
              border: "1px solid #3fb950",
              borderRadius: 6,
              padding: 8,
              marginBottom: 8,
              fontFamily: "monospace",
              fontSize: 12,
              wordBreak: "break-all",
            }}
          >
            {newKey}
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKey);
                setMsg("Key copied!");
              }}
              style={{ fontSize: 10, padding: "2px 8px", marginLeft: 8 }}
            >
              Copy
            </button>
          </div>
        )}
        <div style={{ fontSize: 12 }}>
          {keys.map((k) => (
            <div
              key={k.user_id}
              className="stat-row"
              style={{ padding: "6px 0", borderBottom: "1px solid #30363d" }}
            >
              <span>{k.user_id}</span>
              <span style={{ fontFamily: "monospace", color: "#8b949e" }}>
                {k.key}
              </span>
              <button
                className="danger"
                onClick={() => revokeKey(k.user_id)}
                style={{ fontSize: 10, padding: "2px 8px" }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
