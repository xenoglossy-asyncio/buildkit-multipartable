import { useState, useEffect } from "react";

const RANGE_DAYS: Record<string, number> = { today: 1, "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [averages, setAverages] = useState<any>(null);
  const [daily, setDaily] = useState<number[]>([]);
  const [range, setRange] = useState("7d");

  useEffect(() => {
    const load = async () => {
      try {
        const [s, a] = await Promise.all([
          fetch("/api/v1/stats").then(r => r.json()),
          fetch("/api/v1/stats/averages").then(r => r.json()),
        ]);
        setStats(s); setAverages(a);
      } catch {}
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const days = RANGE_DAYS[range] || 14;
    fetch(`/api/v1/stats/daily?days=${days}`)
      .then(r => r.json())
      .then(d => setDaily(d.counts || []))
      .catch(() => {});
  }, [range]);

  if (!stats) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  const maxDaily = Math.max(1, ...daily);

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Dashboard</div>

      <div className="time-selector">
        {Object.entries(RANGE_DAYS).map(([k, v]) => (
          <button key={k} className={range === k ? "active" : ""} onClick={() => setRange(k)}>
            {k === "today" ? "Today" : `${v}D`}
          </button>
        ))}
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{stats.total_builds}</div>
          <div className="metric-label">Total Builds</div>
        </div>
        <div className="metric-card">
          <div className={`metric-value ${stats.success_rate >= 90 ? "green" : stats.success_rate >= 50 ? "yellow" : ""}`}>
            {stats.success_rate?.toFixed(1)}%
          </div>
          <div className="metric-label">Success Rate</div>
          <div className="progress-bar"><div className="fill green" style={{ width: `${stats.success_rate}%` }} /></div>
          <div className="metric-sub">{stats.succeeded} ok / {stats.failed} fail</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{averages?.avg_build_sec?.toFixed(1) || "—"}s</div>
          <div className="metric-label">Avg Build Time</div>
        </div>
        <div className="metric-card">
          <div className={`metric-value ${(averages?.cache_hit_rate || 0) > 50 ? "green" : "yellow"}`}>
            {averages?.cache_hit_rate?.toFixed(1) || "0"}%
          </div>
          <div className="metric-label">Cache Hit Rate</div>
          <div className="progress-bar"><div className="fill green" style={{ width: `${averages?.cache_hit_rate || 0}%` }} /></div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.active_workers}</div>
          <div className="metric-label">Active Workers</div>
        </div>
        <div className="metric-card">
          <div className={`metric-value ${stats.pending > 10 ? "yellow" : ""}`}>{stats.pending}</div>
          <div className="metric-label">Pending</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.queue_depth}</div>
          <div className="metric-label">Queue Depth</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Builds per Day</h2>
        {daily.length > 0 ? (
          <div className="bar-chart">
            {daily.map((h, i) => (
              <div key={i} className="bar" style={{ height: `${(h / maxDaily) * 100}%` }}
                title={`Day ${daily.length - i}: ${h} builds`} />
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 12 }}>No data for this period</p>
        )}
      </div>
    </div>
  );
}
