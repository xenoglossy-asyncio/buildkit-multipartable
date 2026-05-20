import type { Build } from "../lib/api";

interface Props {
  builds: Build[];
  selected: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

const statusClass: Record<string, string> = {
  pending: "status-pending",
  building: "status-building",
  succeeded: "status-succeeded",
  failed: "status-failed",
  cancelled: "status-cancelled",
  timed_out: "status-failed",
};

export default function BuildList({ builds, selected, onSelect, onRefresh }: Props) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Builds</h2>
        <button onClick={onRefresh} style={{ fontSize: 12, padding: "4px 12px" }}>Refresh</button>
      </div>
      {builds.length === 0 && <p style={{ color: "#8b949e" }}>No builds yet</p>}
      {builds.map((b) => (
        <div
          key={b.id}
          className={`build-row ${selected === b.id ? "selected" : ""}`}
          onClick={() => onSelect(b.id)}
        >
          <span className="build-id" title={b.id}>
            {b.id.substring(0, 8)}
          </span>
          <span className="build-tag">{b.image_tag}</span>
          <span className={`build-status ${statusClass[b.status] || ""}`}>
            {b.status}
          </span>
        </div>
      ))}
    </div>
  );
}
