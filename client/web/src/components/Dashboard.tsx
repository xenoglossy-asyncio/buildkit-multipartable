import { useState, useEffect } from "react";
import { getCached, setCached } from "../lib/useCache";

interface Stats { total_builds: number; succeeded: number; failed: number; success_rate: number; pending: number; active_workers: number; queue_depth: number; }
interface Averages { avg_build_sec: number; cache_hit_rate: number; }
interface UserStat { user_id: string; count: number; succeeded: number; failed: number; avg_time_sec: number; cache_rate: number; success_rate: number; }
interface RunningBuild { id: string; image_tag: string; status: string; elapsed: string; user_id: string; }

async function j(url: string) { const r = await fetch(url); return r.ok ? r.json() : null; }

function StatCard({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-value ${cls || ""}`}>{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [avg, setAvg] = useState<Averages | null>(null);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [running, setRunning] = useState<RunningBuild[]>([]);

  useEffect(() => {
    // Show cached data instantly
    const cached = getCached("dashboard", 10000);
    if (cached) { setStats(cached.s); setAvg(cached.a); setUsers(cached.u); setRunning(cached.r); }

    const load = async () => {
      const [s, a, u, r] = await Promise.all([
        j("/api/v1/stats"), j("/api/v1/stats/averages"),
        j("/api/v1/stats/users?days=30"), j("/api/v1/stats/running"),
      ]);
      const data = { s, a, u: u || [], r: r || [] };
      setCached("dashboard", data);
      setStats(s); setAvg(a); setUsers(u || []); setRunning(r || []);
    };
    load(); const t = setInterval(load, 30000); return () => clearInterval(t);
  }, []);

  if (!stats) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Dashboard</div>

      <div className="metrics-grid">
        <StatCard label="Today" value={`${stats.total_builds}`} sub={`${stats.succeeded} ok / ${stats.failed} fail`} />
        <StatCard label="Success Rate" value={`${stats.success_rate?.toFixed(1)}%`}
          cls={stats.success_rate >= 90 ? "green" : stats.success_rate >= 50 ? "yellow" : ""} sub={`${stats.succeeded} ok / ${stats.failed} fail`} />
        <StatCard label="Avg Build Time" value={`${avg?.avg_build_sec?.toFixed(1) || "—"}s`} />
        <StatCard label="Cache Hit Rate" value={`${avg?.cache_hit_rate?.toFixed(1) || "0"}%`}
          cls={(avg?.cache_hit_rate || 0) > 50 ? "green" : "yellow"} />
        <StatCard label="Workers" value={`${stats.active_workers}`} sub="active" />
        <StatCard label="Pending" value={`${stats.pending}`}
          cls={stats.pending > 10 ? "yellow" : ""} sub={`Queue: ${stats.queue_depth}`} />
      </div>

      {/* Running builds */}
      {running.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Running Builds ({running.length})</h2>
          {running.map(b => (
            <div key={b.id} className="stat-row" style={{ padding: "6px 0" }}>
              <span className="build-id">{b.id.substring(0, 8)}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{b.image_tag}</span>
              <span className={`build-status ${b.status === "building" ? "status-building" : "status-pending"}`}>{b.status}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{b.elapsed}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top users (30D) */}
      {users.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Top Users (30D)</h2>
          <div className="build-row" style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", cursor: "default", padding: "4px 8px" }}>
            <span>User</span><span style={{ textAlign: "right" }}>Builds</span><span style={{ textAlign: "right" }}>Rate</span><span style={{ textAlign: "right" }}>Time</span>
          </div>
          {users.slice(0, 10).map(u => (
            <div key={u.user_id} className="stat-row" style={{ padding: "6px 0", fontSize: 12 }}>
              <span style={{ fontFamily: "monospace" }}>{u.user_id}</span>
              <span style={{ textAlign: "right" }}>{u.count}</span>
              <span style={{ textAlign: "right", color: u.success_rate >= 90 ? "var(--green)" : "var(--muted)" }}>{u.success_rate.toFixed(0)}%</span>
              <span style={{ textAlign: "right", color: "var(--muted)" }}>{u.avg_time_sec.toFixed(1)}s</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
