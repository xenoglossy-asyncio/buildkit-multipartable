import { useState, useEffect } from "react";
import { getCached, setCached } from "../lib/useCache";

interface Daily { days: number; counts: number[]; succeeded: number[]; failed: number[]; labels: string[]; }
interface UserStat { user_id: string; count: number; succeeded: number; failed: number; avg_time_sec: number; cache_rate: number; success_rate: number; }

const RANGES: [string, number][] = [["7D", 7], ["14D", 14], ["30D", 30], ["90D", 90]];

async function j(url: string) { const r = await fetch(url); return r.ok ? r.json() : null; }

export default function History() {
  const [days, setDays] = useState(7);
  const [customDays, setCustomDays] = useState(0);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [avg, setAvg] = useState<any>(null);

  const d = customDays || days;

  useEffect(() => {
    const key = `history-${d}`;
    const cached = getCached(key, 10000);
    if (cached) { setDaily(cached.dl); setUsers(cached.us); setStats(cached.st); setAvg(cached.av); }

    Promise.all([
      j(`/api/v1/stats/daily?days=${d}`),
      j(`/api/v1/stats/users?days=${d}`),
      j("/api/v1/stats"),
      j("/api/v1/stats/averages"),
    ]).then(([dl, us, st, av]) => {
      setCached(key, { dl, us, st, av });
      setDaily(dl); setUsers(us || []); setStats(st); setAvg(av);
    });
  }, [d]);

  // Responsive aggregation: ≤14d show all, >14d show weekly
  const agg = d <= 14 ? 1 : Math.ceil(d / 14);
  const dl = daily;
  const maxD = dl ? Math.max(1, ...dl.counts) : 1;
  const totalBuilds = daily?.counts.reduce((a: number, b: number) => a + b, 0) || 0;
  const avgPerDay = totalBuilds > 0 ? (totalBuilds / d).toFixed(1) : "0";

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>History</div>

      <div className="time-selector" style={{ marginBottom: 16 }}>
        {RANGES.map(([label, nd]) => (
          <button key={label} className={d === nd && !customDays ? "active" : ""} onClick={() => { setDays(nd); setCustomDays(0); }}>{label}</button>
        ))}
        <div className="date-range">
          <input type="number" value={customDays || ""} onChange={e => { const v = +e.target.value; setCustomDays(v > 0 ? v : 0); }} placeholder="Custom days" style={{ width: 100, fontSize: 11 }} />
        </div>
      </div>

      {/* Stats cards */}
      <div className="metrics-grid" style={{ marginBottom: 16 }}>
        <div className="metric-card">
          <div className="metric-value">{totalBuilds}</div>
          <div className="metric-label">Total Builds</div>
        </div>
        <div className="metric-card">
          <div className="metric-value green">{stats?.success_rate?.toFixed(1)}%</div>
          <div className="metric-label">Success Rate</div>
          <div className="progress-bar"><div className="fill green" style={{ width: `${stats?.success_rate || 0}%` }} /></div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{avgPerDay}</div>
          <div className="metric-label">Avg / Day</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{avg?.avg_build_sec?.toFixed(1) || "—"}s</div>
          <div className="metric-label">Avg Build Time</div>
        </div>
        <div className="metric-card">
          <div className={`metric-value ${(avg?.cache_hit_rate || 0) > 50 ? "green" : "yellow"}`}>
            {avg?.cache_hit_rate?.toFixed(1) || "0"}%
          </div>
          <div className="metric-label">Cache Hit Rate</div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>{d <= 14 ? "Daily" : "Weekly"} Builds</h2>
        {dl && dl.counts.length > 0 ? (
          <div>
            <div className="bar-chart" style={{ height: 140, alignItems: "flex-end", marginBottom: 8 }}>
              {dl.counts.filter((_: number, i: number) => i % agg === 0).map((total: number, i: number) => {
                const idx = i * agg;
                // Aggregate next 'agg' days
                let ok = 0, fail = 0;
                for (let j = idx; j < Math.min(idx + agg, dl.counts.length); j++) {
                  ok += dl.succeeded?.[j] || 0;
                  fail += dl.failed?.[j] || 0;
                }
                const sum = ok + fail;
                const pctOk = sum > 0 ? (ok / sum) * 100 : 0;
                const pctFail = sum > 0 ? (fail / sum) * 100 : 0;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", alignItems: "center", minWidth: agg === 1 ? 0 : 30 }}>
                    <div style={{ width: Math.max(8, 90 / (dl.counts.length / agg)), display: "flex", flexDirection: "column", justifyContent: "flex-end", height: `${Math.max(2, (sum / maxD) * 100)}%` }}>
                      {fail > 0 && <div style={{ height: `${pctFail}%`, background: "var(--red)", borderRadius: "1px 1px 0 0", minHeight: 2, transition: "height .3s" }} />}
                      {ok > 0 && <div style={{ height: `${pctOk}%`, background: "var(--green)", borderRadius: fail === 0 ? "2px 2px 0 0" : "0", minHeight: 2, transition: "height .3s" }} />}
                    </div>
                    <span style={{ fontSize: 9, color: "var(--muted)", marginTop: 4, textAlign: "center" }}>
                      {dl.labels?.[idx] || ""}{agg > 1 && dl.labels?.[Math.min(idx + agg - 1, dl.counts.length - 1)] ? `-${dl.labels[Math.min(idx + agg - 1, dl.counts.length - 1)]}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--muted)" }}>
              <span><span style={{ color: "var(--green)" }}>■</span> OK</span>
              <span><span style={{ color: "var(--red)" }}>■</span> Fail</span>
            </div>
          </div>
        ) : <p style={{ color: "var(--muted)", fontSize: 12 }}>No data</p>}
      </div>

      {/* User table */}
      <div className="card">
        <h2>User Builds ({users.length})</h2>
        {users.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>User ID</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Builds</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Avg Time</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Cache Rate</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Success Rate</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace" }}>{u.user_id}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{u.count}</td>
                  <td style={{ padding: "8px", textAlign: "right", color: "var(--muted)" }}>{u.avg_time_sec.toFixed(1)}s</td>
                  <td style={{ padding: "8px", textAlign: "right", color: "var(--muted)" }}>{u.cache_rate.toFixed(1)}%</td>
                  <td style={{ padding: "8px", textAlign: "right", color: u.success_rate >= 90 ? "var(--green)" : u.success_rate >= 50 ? "var(--muted)" : "var(--red)" }}>
                    {u.success_rate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p style={{ color: "var(--muted)", fontSize: 12 }}>No user data</p>}
      </div>
    </div>
  );
}
