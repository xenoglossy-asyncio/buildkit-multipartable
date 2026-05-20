import { useState, useEffect } from "react";

const BASE = "/api/v1/admin";
const H = (): Record<string, string> => {
  const key = localStorage.getItem("dtbuild_api_key") || "";
  return { "x-admin-key": key };
};

type Page = "overview" | "quotas" | "keys";

export default function AdminPanel() {
  const [page, setPage] = useState<Page>("overview");
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [quotaUser, setQuotaUser] = useState("");
  const [quota, setQuota] = useState<any>(null);
  const [qForm, setQForm] = useState({ max_concurrent: 5, max_daily: 100, max_storage_bytes: 0, max_timeout_sec: 1800 });
  const [newKeyUser, setNewKeyUser] = useState("");
  const [newKeyVal, setNewKeyVal] = useState("");
  const [msg, setMsg] = useState("");

  async function api(method: string, path: string, body?: any) {
    const opts: any = { method, headers: { ...H() } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(BASE + path, opts);
    if (!res.ok) throw new Error(await res.text());
    if (res.status === 204) return null;
    return res.json();
  }

  useEffect(() => {
    Promise.all([api("GET", "/health"), api("GET", "/stats"), api("GET", "/keys")])
      .then(([h, s, k]) => { setHealth(h); setStats(s); setKeys(k || []); })
      .catch(() => {});
    const t = setInterval(() => {
      api("GET", "/health").then(setHealth).catch(() => {});
      api("GET", "/stats").then(setStats).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  async function loadQuota() {
    if (!quotaUser) return;
    try {
      const q = await api("GET", `/quotas/${quotaUser}`);
      setQuota(q); setQForm({ max_concurrent: q.max_concurrent, max_daily: q.max_daily, max_storage_bytes: q.max_storage_bytes, max_timeout_sec: q.max_timeout_sec });
    } catch { setQuota(null); }
  }

  async function saveQuota() { try { await api("PUT", `/quotas/${quotaUser}`, qForm); setMsg("Saved"); loadQuota(); } catch (e: any) { setMsg(e.message); } }
  async function deleteQuota() { try { await api("DELETE", `/quotas/${quotaUser}`); setQuota(null); setMsg("Reset"); } catch (e: any) { setMsg(e.message); } }
  async function createKey() {
    if (!newKeyUser) return;
    try { const r = await api("POST", "/keys", { user_id: newKeyUser }); setNewKeyVal(r.api_key); setMsg("Created"); api("GET", "/keys").then(k => setKeys(k || [])); } catch (e: any) { setMsg(e.message); }
  }
  async function revokeKey(uid: string) { try { await api("DELETE", `/keys/${uid}`); setMsg("Revoked"); api("GET", "/keys").then(k => setKeys(k || [])); } catch (e: any) { setMsg(e.message); } }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Admin</div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(["overview", "quotas", "keys"] as Page[]).map(p => (
            <button key={p} className={page === p ? "active" : ""} onClick={() => { setPage(p); setMsg(""); }}>
              {p === "overview" ? "Overview" : p === "quotas" ? "Quotas" : "API Keys"}
            </button>
          ))}
        </div>
      </div>

      {msg && <div className="card" style={{ padding: "6px 14px", marginBottom: 12, fontSize: 12, color: msg.includes("Saved") || msg.includes("Created") || msg.includes("Revoked") ? "var(--green)" : "var(--red)" }}>{msg}</div>}

      {page === "overview" && health && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="card">
              <h2>System Health</h2>
              <div className="stat-row"><span>DB</span><span style={{ color: "var(--green)" }}>online</span></div>
              <div className="stat-row"><span>Active Workers</span><span>{health.active_workers}</span></div>
              <div className="stat-row"><span>Pending Builds</span><span>{health.pending_builds}</span></div>
              <div className="stat-row"><span>Queue Depth</span><span>{health.queue_depth}</span></div>
            </div>
            <div className="card">
              <h2>Build Stats</h2>
              <div className="stat-row"><span>Total Builds</span><span>{stats.total_builds}</span></div>
              <div className="stat-row"><span>Succeeded</span><span style={{ color: "var(--green)" }}>{stats.succeeded}</span></div>
              <div className="stat-row"><span>Failed</span><span style={{ color: "var(--red)" }}>{stats.failed}</span></div>
              <div className="stat-row"><span>Success Rate</span><span>{stats.success_rate?.toFixed(1)}%</span></div>
            </div>
          </div>
        </div>
      )}

      {page === "quotas" && (
        <div className="card">
          <h2>Quota Management</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Set per-user limits. 0 = unlimited.</p>
          <div className="row" style={{ marginBottom: 12 }}>
            <input placeholder="User ID" value={quotaUser} onChange={(e) => setQuotaUser(e.target.value)} style={{ flex: 1 }} />
            <button onClick={loadQuota}>Load</button>
          </div>
          {quota !== null && quota !== undefined && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <label className="qlabel">Max Concurrent <input type="number" value={qForm.max_concurrent} onChange={e => setQForm({ ...qForm, max_concurrent: +e.target.value })} /></label>
                <label className="qlabel">Max Daily <input type="number" value={qForm.max_daily} onChange={e => setQForm({ ...qForm, max_daily: +e.target.value })} /></label>
                <label className="qlabel">Max Storage (bytes) <input type="number" value={qForm.max_storage_bytes} onChange={e => setQForm({ ...qForm, max_storage_bytes: +e.target.value })} /></label>
                <label className="qlabel">Max Timeout (sec) <input type="number" value={qForm.max_timeout_sec} onChange={e => setQForm({ ...qForm, max_timeout_sec: +e.target.value })} /></label>
              </div>
              <div className="row">
                <button onClick={saveQuota}>Save</button>
                <button className="danger" onClick={deleteQuota}>Reset to Unlimited</button>
              </div>
            </div>
          )}
        </div>
      )}

      {page === "keys" && (
        <div className="card">
          <h2>API Key Management</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Create and revoke user API keys.</p>
          <div className="row" style={{ marginBottom: 16 }}>
            <input placeholder="User ID" value={newKeyUser} onChange={(e) => setNewKeyUser(e.target.value)} style={{ flex: 1 }} />
            <button onClick={createKey}>Create Key</button>
          </div>
          {newKeyVal && (
            <div style={{ background: "var(--bg)", border: "1px solid var(--green)", borderRadius: 8, padding: 10, marginBottom: 16, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
              {newKeyVal}
              <button className="small" onClick={() => { navigator.clipboard.writeText(newKeyVal); setMsg("Copied!"); }} style={{ marginLeft: 8 }}>Copy</button>
            </div>
          )}
          <h2 style={{ marginTop: 16 }}>Existing Keys ({keys.length})</h2>
          {keys.map((k: any) => (
            <div key={k.user_id} className="stat-row" style={{ padding: "8px 0" }}>
              <span style={{ fontWeight: 600 }}>{k.user_id}</span>
              <span style={{ fontFamily: "monospace", color: "var(--muted)", fontSize: 11 }}>{k.key}</span>
              <button className="danger small" onClick={() => revokeKey(k.user_id)}>Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
