import { useState, useEffect } from "react";

const BASE = "/api/v1/admin";
const H = (): Record<string, string> => {
  const k = localStorage.getItem("dtbuild_api_key") || "";
  return { "x-admin-key": k };
};
async function api(m: string, p: string, b?: any) {
  const o: any = { method: m, headers: { ...H() } };
  if (b) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(b); }
  const r = await fetch(BASE + p, o);
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

type Page = "overview" | "users";

export default function AdminPanel() {
  const [page, setPage] = useState<Page>("overview");
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
    const [qForm, setQForm] = useState({ max_concurrent: 5, max_daily: 100, max_storage_bytes: 0, max_timeout_sec: 1800 });
  const [newKeyUser, setNewKeyUser] = useState("");
  const [newKeyVal, setNewKeyVal] = useState("");
  const [msg, setMsg] = useState("");
  const [userPg, setUserPg] = useState(0);
  const [userPp, setUserPp] = useState(15);
  const [userJump, setUserJump] = useState("");

  useEffect(() => {
    const cached = JSON.parse(sessionStorage.getItem("dtb_admin") || "null");
    if (cached) { setHealth(cached.h); setStats(cached.s); setKeys(cached.k || []); setUsers((cached.k || []).map((x: any) => x.user_id)); }

    const load = () => Promise.all([api("GET", "/health"), api("GET", "/stats"), api("GET", "/keys")])
      .then(([h, s, k]) => {
        sessionStorage.setItem("dtb_admin", JSON.stringify({ h, s, k }));
        setHealth(h); setStats(s); setKeys(k || []); setUsers((k || []).map((x: any) => x.user_id));
      }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  async function loadQuota(uid: string) {
    setSelectedUser(uid);
    try {
      const q = await api("GET", `/quotas/${uid}`);
      setQForm({ max_concurrent: q.max_concurrent, max_daily: q.max_daily, max_storage_bytes: q.max_storage_bytes, max_timeout_sec: q.max_timeout_sec });
    } catch { setQForm({ max_concurrent: 5, max_daily: 100, max_storage_bytes: 0, max_timeout_sec: 1800 }); }
  }

  async function saveQuota() {
    try { await api("PUT", `/quotas/${selectedUser}`, qForm); setMsg("Quota saved"); loadQuota(selectedUser); } catch (e: any) { setMsg(e.message); }
  }
  async function resetQuota() { try { await api("DELETE", `/quotas/${selectedUser}`); setMsg("Reset"); } catch (e: any) { setMsg(e.message); } }
  async function createKey() {
    if (!newKeyUser) return;
    try { const r = await api("POST", "/keys", { user_id: newKeyUser }); setNewKeyVal(r.api_key); setMsg("Key created"); api("GET", "/keys").then(k => { setKeys(k || []); setUsers((k || []).map((x: any) => x.user_id)); }); } catch (e: any) { setMsg(e.message); }
  }
  async function revokeKey(uid: string) { try { await api("DELETE", `/keys/${uid}`); setMsg("Revoked"); api("GET", "/keys").then(k => { setKeys(k || []); setUsers((k || []).map((x: any) => x.user_id)); }); if (selectedUser === uid) setSelectedUser(""); } catch (e: any) { setMsg(e.message); } }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Admin</div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(["overview", "users"] as Page[]).map(p => (
            <button key={p} className={page === p ? "active" : ""} onClick={() => { setPage(p); setMsg(""); }}>
              {p === "overview" ? "Overview" : "Users"}
            </button>
          ))}
        </div>
      </div>

      {msg && <div className="card" style={{ padding: "6px 14px", marginBottom: 12, fontSize: 12, color: msg.includes("saved") || msg.includes("created") || msg.includes("Revoked") || msg.includes("Reset") || msg.includes("Copied") ? "var(--green)" : "var(--red)" }}>{msg}</div>}

      {page === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="card">
              <h2>System Health</h2>
              {health ? (
                <div>
                  <div className="stat-row"><span>DB</span><span style={{ color: "var(--green)" }}>online</span></div>
                  <div className="stat-row"><span>Active Workers</span><span>{health.active_workers}</span></div>
                  <div className="stat-row"><span>Pending Builds</span><span>{health.pending_builds}</span></div>
                  <div className="stat-row"><span>Queue Depth</span><span>{health.queue_depth}</span></div>
                </div>
              ) : <p style={{ color: "var(--muted)", fontSize: 12 }}>Loading...</p>}
            </div>
            <div className="card">
              <h2>Build Stats</h2>
              {stats ? (
                <div>
                  <div className="stat-row"><span>Total Builds</span><span>{stats.total_builds}</span></div>
                  <div className="stat-row"><span>Succeeded</span><span style={{ color: "var(--green)" }}>{stats.succeeded}</span></div>
                  <div className="stat-row"><span>Failed</span><span style={{ color: "var(--red)" }}>{stats.failed}</span></div>
                  <div className="stat-row"><span>Success Rate</span><span>{stats.success_rate?.toFixed(1)}%</span></div>
                </div>
              ) : <p style={{ color: "var(--muted)", fontSize: 12 }}>Loading...</p>}
            </div>
          </div>

          <div className="card">
            <h2>Registered Users ({users.length})</h2>
            {users.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 12 }}>No users yet — create an API key to register a user.</p> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {users.map(u => <span key={u} style={{ background: "var(--bg)", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontFamily: "monospace", cursor: "pointer" }} onClick={() => { setPage("users"); loadQuota(u); }}>{u}</span>)}
              </div>
            )}
          </div>
        </div>
      )}

      {page === "users" && (
        <div>
          {/* Create new user bar */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="row">
              <input placeholder="New User ID" value={newKeyUser} onChange={e => setNewKeyUser(e.target.value)} style={{ flex: 1 }} />
              <button onClick={createKey}>Create User + Key</button>
            </div>
            {newKeyVal && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--green)", borderRadius: 8, padding: 10, marginTop: 8, fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>
                {newKeyVal}
                <button className="small" onClick={() => { navigator.clipboard.writeText(newKeyVal); setMsg("Copied!"); }} style={{ marginLeft: 8 }}>Copy</button>
              </div>
            )}
          </div>

          {/* User table */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Users ({users.length})</h2>
              <select value={userPp} onChange={e => { setUserPp(+e.target.value); setUserPg(0); }} style={{ fontSize: 11, padding: "2px 6px" }}>
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/pg</option>)}
              </select>
            </div>
            {users.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 12 }}>No registered users yet.</p> : (
              <>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User ID</th><th>Key</th><th style={{ textAlign: "center", width: 60 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice(userPg * userPp, (userPg + 1) * userPp).map(u => {
                      const hasKey = keys.find((k: any) => k.user_id === u);
                      const expanded = selectedUser === u;
                      return (
                        <>
                          <tr key={u} onClick={() => expanded ? setSelectedUser("") : loadQuota(u)} style={{ cursor: "pointer" }} className={expanded ? "expanded" : ""}>
                            <td style={{ fontFamily: "monospace" }}>{u}</td>
                            <td style={{ fontFamily: "monospace", color: "var(--muted)", fontSize: 11 }}>
                              {hasKey ? hasKey.key : "—"}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button className="danger small" onClick={(e) => { e.stopPropagation(); revokeKey(u); }}>Revoke</button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="expand-row">
                              <td colSpan={3}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                  <label className="qlabel">Max Concurrent <input type="number" value={qForm.max_concurrent} onChange={e => setQForm({ ...qForm, max_concurrent: +e.target.value })} /></label>
                                  <label className="qlabel">Max Daily <input type="number" value={qForm.max_daily} onChange={e => setQForm({ ...qForm, max_daily: +e.target.value })} /></label>
                                  <label className="qlabel">Max Storage (bytes) <input type="number" value={qForm.max_storage_bytes} onChange={e => setQForm({ ...qForm, max_storage_bytes: +e.target.value })} /></label>
                                  <label className="qlabel">Max Timeout (sec) <input type="number" value={qForm.max_timeout_sec} onChange={e => setQForm({ ...qForm, max_timeout_sec: +e.target.value })} /></label>
                                </div>
                                <div className="row">
                                  <button onClick={saveQuota}>Save Quota</button>
                                  <button className="danger" onClick={resetQuota}>Reset</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
                {Math.ceil(users.length / userPp) > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 16 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 8 }}>
                      {userPp}/page &middot; {users.length} total
                    </span>
                    <button className="small ghost" disabled={userPg === 0} onClick={() => setUserPg(userPg - 1)}>←</button>
                    {Array.from({ length: Math.min(7, Math.ceil(users.length / userPp)) }, (_, i) => {
                      const totalPages = Math.ceil(users.length / userPp);
                      const start = Math.max(0, userPg - 3);
                      const end = Math.min(totalPages, userPg + 4);
                      const p = start + i;
                      if (p >= end) return null;
                      return (
                        <button key={p} className={`small ${p === userPg ? "" : "ghost"}`} onClick={() => setUserPg(p)}>{p + 1}</button>
                      );
                    })}
                    <button className="small ghost" disabled={userPg >= Math.ceil(users.length / userPp) - 1} onClick={() => setUserPg(userPg + 1)}>→</button>
                    <input
                      placeholder="page"
                      value={userJump}
                      onChange={e => setUserJump(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { const n = parseInt(userJump) - 1; const max = Math.ceil(users.length / userPp); if (n >= 0 && n < max) { setUserPg(n); setUserJump(""); } } }}
                      style={{ width: 44, fontSize: 11, padding: "3px 6px", marginLeft: 4, textAlign: "center" }}
                    />
                    <button className="small ghost" style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => { const n = parseInt(userJump) - 1; const max = Math.ceil(users.length / userPp); if (n >= 0 && n < max) { setUserPg(n); setUserJump(""); } }}>Go</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
