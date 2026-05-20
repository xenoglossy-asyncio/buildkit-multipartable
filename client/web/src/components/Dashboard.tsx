import { useState, useEffect, useCallback } from "react";

interface Stats {
  total_builds: number;
  succeeded: number;
  failed: number;
  success_rate: number;
  pending: number;
  active_workers: number;
  queue_depth: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!stats) return <div className="card" style={{ gridColumn: "1/-1" }}><p style={{ color: "var(--muted)" }}>Loading...</p></div>;

  return (
    <div style={{ gridColumn: "1/-1" }}>
      <h2 style={{ color: "var(--primary)", marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div className="metric-card">
          <div className="metric-value">{stats.total_builds}</div>
          <div className="metric-label">Total Builds</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: stats.success_rate >= 90 ? "var(--green)" : "var(--yellow)" }}>
            {stats.success_rate.toFixed(1)}%
          </div>
          <div className="metric-label">Success Rate</div>
          <div className="metric-sub">{stats.succeeded} succeeded / {stats.failed} failed</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.active_workers}</div>
          <div className="metric-label">Active Workers</div>
        </div>
        <div className="metric-card">
          <div className="metric-value" style={{ color: stats.pending > 10 ? "var(--yellow)" : "var(--primary)" }}>
            {stats.pending}
          </div>
          <div className="metric-label">Pending Builds</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.queue_depth}</div>
          <div className="metric-label">Queue Depth</div>
        </div>
      </div>
    </div>
  );
}
