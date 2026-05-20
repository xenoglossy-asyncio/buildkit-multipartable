import { useState, useEffect } from "react";
import { type Build, type BuildPage } from "../lib/api";

interface Props { selected: string | null; onSelect: (id: string) => void; }

const statusC: Record<string, string> = {
  pending: "status-pending", building: "status-building",
  succeeded: "status-succeeded", failed: "status-failed",
  cancelled: "status-cancelled", timed_out: "status-failed",
};

function timeStr(b: Build): string {
  if (!b.created_at) return "—";
  const end = b.completed_at ? new Date(b.completed_at) : new Date();
  const s = Math.round((end.getTime() - new Date(b.created_at).getTime()) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}
function cachePct(b: Build): string {
  if (!b.logs) return "—";
  const c = (b.logs.match(/CACHED/g) || []).length;
  const d = (b.logs.match(/DONE/g) || []).length;
  return d === 0 ? "—" : `${Math.round((c / d) * 100)}%`;
}

export default function BuildList({ selected, onSelect }: Props) {
  const [page, setPage] = useState<BuildPage | null>(null);
  const [pg, setPg] = useState(0);
  const [pp, setPp] = useState(15);
  const [jump, setJump] = useState("");

  async function load() {
    try {
      const r = await fetch(`/api/v1/builds?limit=${pp}&offset=${pg * pp}`);
      if (r.ok) setPage(await r.json());
    } catch {}
  }

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [pg, pp]);

  const totalPages = page ? Math.ceil(page.total / pp) : 0;

  const pages = (): number[] => {
    const p: number[] = [];
    const start = Math.max(0, pg - 3);
    const end = Math.min(totalPages, pg + 4);
    for (let i = start; i < end; i++) p.push(i);
    return p;
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Builds {page ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>({page.total})</span> : <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>loading...</span>}</h2>
        <button className="small ghost" onClick={load}>Refresh</button>
      </div>

      {/* Column headers */}
      <div className="build-row" style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", cursor: "default", padding: "4px 8px" }}>
        <span style={{ width: 70, fontFamily: "monospace" }}>ID</span>
        <span style={{ flex: 1 }}>Tag</span>
        <span style={{ width: 50, textAlign: "right" }}>Time</span>
        <span style={{ width: 50, textAlign: "right" }}>Cache</span>
        <span style={{ width: 80, textAlign: "right" }}>Status</span>
      </div>

      {!page && <p style={{ color: "var(--muted)", fontSize: 12 }}>Loading...</p>}
      {page?.builds.length === 0 && <p style={{ color: "var(--muted)", fontSize: 12 }}>No builds yet</p>}

      {page?.builds.map(b => (
        <div key={b.id} className={`build-row ${selected === b.id ? "selected" : ""}`}
          onClick={() => onSelect(b.id)}>
          <span className="build-id" title={b.id} style={{ width: 70 }}>{b.id.substring(0, 8)}</span>
          <span className="build-tag" title={b.image_tag} style={{ flex: 1 }}>{b.image_tag || "—"}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", width: 50, textAlign: "right" }}>{timeStr(b)}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", width: 50, textAlign: "right" }}>{cachePct(b)}</span>
          <span className={`build-status ${statusC[b.status] || ""}`} style={{ width: 80, textAlign: "center" }}>{b.status}</span>
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 16 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", marginRight: 8 }}>
            {pp}/page &middot; {page?.total} total
          </span>
          <button className="small ghost" disabled={pg === 0} onClick={() => setPg(pg - 1)}>←</button>
          {pages().map(p => (
            <button key={p} className={`small ${p === pg ? "" : "ghost"}`} onClick={() => setPg(p)}>{p + 1}</button>
          ))}
          <button className="small ghost" disabled={pg >= totalPages - 1} onClick={() => setPg(pg + 1)}>→</button>
          <input
            placeholder="page"
            value={jump}
            onChange={e => setJump(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { const n = parseInt(jump) - 1; if (n >= 0 && n < totalPages) { setPg(n); setJump(""); } } }}
            style={{ width: 44, fontSize: 11, padding: "3px 6px", marginLeft: 4, textAlign: "center" }}
          />
          <button className="small ghost" style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => { const n = parseInt(jump) - 1; if (n >= 0 && n < totalPages) { setPg(n); setJump(""); } }}>Go</button>
        </div>
      )}
    </div>
  );
}
