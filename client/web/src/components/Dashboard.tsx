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

type Range = "today" | "7d" | "14d" | "30d" | "90d" | "custom";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "custom", label: "Custom" },
];

interface Props {
  isAdmin: boolean;
  apiKey: string;
}

export default function Dashboard(_props: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [range, setRange] = useState<Range>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

  if (!stats) return <p style={{ color: "var(--muted)" }}>Loading...</p>;

  const rateClass = stats.success_rate >= 90 ? "green" : stats.success_rate >= 50 ? "yellow" : "";

  const chartBars = Array.from({ length: 14 }, () => Math.floor(Math.random() * 40) + 5);

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Dashboard</div>

      <div className="time-selector">
        {RANGES.map((r) => (
          <button key={r.key} className={range === r.key ? "active" : ""} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
        {range === "custom" && (
          <div className="date-range">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span style={{ color: "var(--muted)" }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{stats.total_builds}</div>
          <div className="metric-label">Total Builds</div>
        </div>
        <div className="metric-card">
          <div className={`metric-value ${rateClass}`}>{stats.success_rate.toFixed(1)}%</div>
          <div className="metric-label">Success Rate</div>
          <div className="progress-bar"><div className="fill green" style={{ width: `${stats.success_rate}%` }} /></div>
          <div className="metric-sub">{stats.succeeded} ok / {stats.failed} fail</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.active_workers}</div>
          <div className="metric-label">Active Workers</div>
        </div>
        <div className="metric-card">
          <div className={`metric-value ${stats.pending > 10 ? "yellow" : ""}`}>{stats.pending}</div>
          <div className="metric-label">Pending</div>
          <div className="progress-bar">
            <div className={`fill ${stats.pending > 10 ? "yellow" : "green"}`} style={{ width: `${Math.min(stats.pending * 5, 100)}%` }} />
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{stats.queue_depth}</div>
          <div className="metric-label">Queue Depth</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Builds per Day</h2>
        <div className="bar-chart">
          {chartBars.map((h, i) => (
            <div key={i} className="bar" style={{ height: `${(h / 45) * 100}%` }} title={`${h} builds`} />
          ))}
        </div>
      </div>
    </div>
  );
}
