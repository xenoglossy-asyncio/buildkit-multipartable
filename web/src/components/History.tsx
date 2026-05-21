import { useState, useEffect } from "react";
import { getCached, setCached } from "../lib/useCache";

interface Daily { days: number; counts: number[]; succeeded: number[]; failed: number[]; labels: string[]; }
interface UserStat { user_id: string; count: number; succeeded: number; failed: number; avg_time_sec: number; cache_rate: number; success_rate: number; }

const RANGES: [string, number][] = [["7D", 7], ["14D", 14], ["30D", 30], ["90D", 90]];

async function j(url: string, signal?: AbortSignal) { const r = await fetch(url, { signal }); return r.ok ? r.json() : null; }

function daysBetween(from: string, to: string): number {
  if (!from || !to) return 7;
  return Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
}

export default function History() {
  const [days, setDays] = useState(7);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const d = useCustom ? daysBetween(customFrom, customTo) : days;
  const [daily, setDaily] = useState<Daily | null>(null);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [avg, setAvg] = useState<any>(null);


  useEffect(() => {
    const key = `history-${d}`;
    const cached = getCached(key, 10000);
    if (cached) { setDaily(cached.dl); setUsers(cached.us || []); setStats(cached.st); setAvg(cached.av); }
    else {
      // Clear old data while loading new data
      setDaily(null);
      setUsers([]);
    }

    const controller = new AbortController();
    Promise.all([
      j(`/api/v1/stats/daily?days=${d}`, controller.signal),
      j(`/api/v1/stats/users?days=${d}`, controller.signal),
      j("/api/v1/stats", controller.signal),
      j("/api/v1/stats/averages", controller.signal),
    ]).then(([dl, us, st, av]) => {
      setCached(key, { dl, us, st, av });
      setDaily(dl); setUsers(us || []); setStats(st); setAvg(av);
    }).catch(() => {});

    return () => controller.abort();
  }, [d]);

  const agg = d <= 14 ? 1 : Math.ceil(d / 14);
  const dl = daily;
  const maxD = dl ? Math.max(1, ...dl.counts) : 1;
  const totalBuilds = daily?.counts.reduce((a: number, b: number) => a + b, 0) || 0;
  const avgPerDay = totalBuilds > 0 ? (totalBuilds / d).toFixed(1) : "0";

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>History</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div className="time-selector">
          {RANGES.map(([label, nd]) => (
            <button key={label} className={d === nd && !useCustom ? "active" : ""} onClick={() => { setDays(nd); setUseCustom(false); }}>{label}</button>
          ))}
          <button className={useCustom ? "active" : ""} onClick={() => setUseCustom(true)}>Custom</button>
        </div>
        {useCustom && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              style={{ cursor: "pointer" }}
              onClick={e => (e.target as HTMLInputElement).showPicker?.()}
            />
            <span style={{ color: "var(--muted)", fontSize: 11 }}>to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              style={{ cursor: "pointer" }}
              onClick={e => (e.target as HTMLInputElement).showPicker?.()}
            />
            {d > 0 && <span style={{ color: "var(--muted)", fontSize: 11 }}>({d} days)</span>}
          </div>
        )}
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
              {dl.counts.filter((_: number, i: number) => i % agg === 0).map((_total: number, i: number) => {
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
