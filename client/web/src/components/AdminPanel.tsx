import { useState, useEffect } from "react";

const BASE = "/api/v1/admin";
function adminHeaders(): Record<string, string> {
  const key = localStorage.getItem("dtbuild_api_key") || "";
  return { "x-admin-key": key };
}

async function get(path: string) {
  const res = await fetch(BASE + path, { headers: adminHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function put(path: string, body: any) {
  const res = await fetch(BASE + path, {
    method: "PUT", headers: { ...adminHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function post(path: string, body?: any) {
  const res = await fetch(BASE + path, {
    method: "POST", headers: { ...adminHeaders(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function del(path: string) {
  const res = await fetch(BASE + path, { method: "DELETE", headers: adminHeaders() });
  if (!res.ok) throw new Error(await res.text());
}

export default function AdminPanel() {
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [quotaUser, setQuotaUser] = useState("");
  const [quota, setQuota] = useState<any>(null);
  const [qForm, setQForm] = useState({ max_concurrent: 5, max_daily: 100, max_storage_bytes: 0, max_timeout_sec: 1800 });
  const [newKeyUser, setNewKeyUser] = useState("");
  const [newKeyVal, setNewKeyVal] = useState("");
  const [keys, setKeys] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  async function loadAll() {
    try {
      const [h, s, k] = await Promise.all([get("/health"), get("/stats"), get("/keys")]);
      setHealth(h); setStats(s); setKeys(k);
    } catch (e: any) { setMsg(e.message); }
  }

  useEffect(() => { loadAll(); const t = setInterval(loadAll, 10000); return () => clearInterval(t); }, []);

  async function loadQuota() {
    if (!quotaUser) return;
    try {
      const q = await get(`/quotas/${quotaUser}`);
      setQuota(q); setQForm({ max_concurrent: q.max_concurrent, max_daily: q.max_daily, max_storage_bytes: q.max_storage_bytes, max_timeout_sec: q.max_timeout_sec });
    } catch { setQuota(null); }
  }

  async function saveQuota() {
    try { await put(`/quotas/${quotaUser}`, qForm); setMsg("Quota saved"); loadQuota(); } catch (e: any) { setMsg(e.message); }
  }

  async function deleteQuota() {
    try { await del(`/quotas/${quotaUser}`); setQuota(null); setMsg("Quota reset"); } catch (e: any) { setMsg(e.message); }
  }

  async function createKey() {
    if (!newKeyUser) return;
    try {
      const r = await post("/keys", { user_id: newKeyUser });
      setNewKeyVal(r.api_key); setMsg(`Key created for ${newKeyUser}`); loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function revokeKey(uid: string) {
    try { await del(`/keys/${uid}`); setMsg(`Key revoked for ${uid}`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>Admin Panel</div>
      {msg && <div className="card" style={{ padding: "8px 16px", marginBottom: 12, fontSize: 12, color: msg.includes("saved") || msg.includes("created") ? "var(--green)" : "var(--red)" }}>{msg}</div>}

      {/* Health + Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="card">
          <h2>System Health</h2>
          {health && (
            <div>
              <div className="stat-row"><span>DB</span><span style={{ color: "var(--green)" }}>online</span></div>
              <div className="stat-row"><span>Active Workers</span><span>{health.active_workers}</span></div>
              <div className="stat-row"><span>Pending</span><span>{health.pending_builds}</span></div>
              <div className="stat-row"><span>Queue</span><span>{health.queue_depth}</span></div>
            </div>
          )}
        </div>
        <div className="card">
          <h2>Stats</h2>
          {stats && (
            <div>
              <div className="stat-row"><span>Total</span><span>{stats.total_builds}</span></div>
              <div className="stat-row"><span>Succeeded</span><span style={{ color: "var(--green)" }}>{stats.succeeded}</span></div>
              <div className="stat-row"><span>Failed</span><span style={{ color: "var(--red)" }}>{stats.failed}</span></div>
              <div className="stat-row"><span>Rate</span><span>{stats.success_rate?.toFixed(1)}%</span></div>
            </div>
          )}
        </div>
      </div>

      {/* Worker control */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Worker Control</h2>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Scale workers by deploying more instances via K8s or compose. This shows current count.</p>
        <div className="stat-row">
          <span>Active Workers</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>{health?.active_workers || 0}</span>
        </div>
      </div>

      {/* Quotas */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Quota Management</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="User ID" value={quotaUser} onChange={(e) => setQuotaUser(e.target.value)} style={{ flex: 1 }} />
          <button onClick={loadQuota}>Load</button>
        </div>
        {quota !== null && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <label className="qlabel">Max Concurrent <input type="number" value={qForm.max_concurrent} onChange={(e) => setQForm({ ...qForm, max_concurrent: +e.target.value })} /></label>
              <label className="qlabel">Max Daily <input type="number" value={qForm.max_daily} onChange={(e) => setQForm({ ...qForm, max_daily: +e.target.value })} /></label>
              <label className="qlabel">Max Storage (bytes) <input type="number" value={qForm.max_storage_bytes} onChange={(e) => setQForm({ ...qForm, max_storage_bytes: +e.target.value })} /></label>
              <label className="qlabel">Max Timeout (sec) <input type="number" value={qForm.max_timeout_sec} onChange={(e) => setQForm({ ...qForm, max_timeout_sec: +e.target.value })} /></label>
            </div>
            <div className="row">
              <button onClick={saveQuota}>Save</button>
              <button className="danger" onClick={deleteQuota}>Reset</button>
            </div>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>API Keys</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="User ID" value={newKeyUser} onChange={(e) => setNewKeyUser(e.target.value)} style={{ flex: 1 }} />
          <button onClick={createKey}>Create</button>
        </div>
        {newKeyVal && (
          <div style={{ background: "var(--bg)", border: "1px solid var(--green)", borderRadius: 6, padding: 8, marginBottom: 8, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
            {newKeyVal}
            <button className="small" onClick={() => { navigator.clipboard.writeText(newKeyVal); setMsg("Copied!"); }} style={{ marginLeft: 8 }}>Copy</button>
          </div>
        )}
        {keys.map((k: any) => (
          <div key={k.user_id} className="stat-row" style={{ padding: "6px 0" }}>
            <span>{k.user_id}</span>
            <span style={{ fontFamily: "monospace", color: "var(--muted)" }}>{k.key}</span>
            <button className="danger small" onClick={() => revokeKey(k.user_id)}>Revoke</button>
          </div>
        ))}
      </div>
    </div>
  );
}
