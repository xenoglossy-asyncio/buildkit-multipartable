import { useState, useEffect } from "react";
import { type Build, type BuildPage } from "../lib/api";

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

const PAGE_SIZE = 15;

const statusClass: Record<string, string> = {
  pending: "status-pending", building: "status-building",
  succeeded: "status-succeeded", failed: "status-failed",
  cancelled: "status-cancelled", timed_out: "status-failed",
};

function buildTime(b: Build): string {
  if (!b.created_at) return "—";
  const end = b.completed_at ? new Date(b.completed_at) : new Date();
  const start = new Date(b.created_at);
  const sec = Math.round((end.getTime() - start.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function cacheHint(b: Build): string {
  if (!b.logs) return "—";
  const cached = (b.logs.match(/CACHED/g) || []).length;
  const total = (b.logs.match(/DONE/g) || []).length;
  if (total === 0) return "—";
  return `${Math.round((cached / total) * 100)}%`;
}

export default function BuildList({ selected, onSelect }: Props) {
  const [page, setPage] = useState<BuildPage | null>(null);
  const [pageNum, setPageNum] = useState(0);

  async function refresh() {
    try {
      const res = await fetch(`/api/v1/builds?limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`);
      if (res.ok) setPage(await res.json());
    } catch {}
  }

  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [pageNum]);
  // eslint-disable-next-line
  useEffect(() => { refresh(); }, [pageNum]);

  const totalPages = page ? Math.ceil(page.total / PAGE_SIZE) : 0;

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Builds {page && <span style={{ color: "var(--muted)", fontWeight: 400 }}>({page.total})</span>}</h2>
        <button className="small ghost" onClick={refresh}>Refresh</button>
      </div>

      {(!page || page.builds.length === 0) && <p style={{ color: "var(--muted)" }}>No builds yet</p>}

      {page?.builds.map((b) => (
        <div key={b.id} className={`build-row ${selected === b.id ? "selected" : ""}`}
          onClick={() => onSelect(b.id)}>
          <span className="build-id" title={b.id}>{b.id.substring(0, 8)}</span>
          <span className="build-tag">{b.image_tag || "—"}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", width: 50, textAlign: "right" }}>{buildTime(b)}</span>
          <span style={{ fontSize: 11, color: "var(--muted)", width: 40, textAlign: "right" }}>{cacheHint(b)}</span>
          <span className={`build-status ${statusClass[b.status] || ""}`}>{b.status}</span>
        </div>
      ))}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 12 }}>
          <button className="small ghost" disabled={pageNum === 0} onClick={() => setPageNum(pageNum - 1)}>←</button>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const p = pageNum < 5 ? i : pageNum > totalPages - 6 ? totalPages - 10 + i : pageNum - 5 + i;
            if (p < 0 || p >= totalPages) return null;
            return <button key={p} className={`small ${p === pageNum ? "" : "ghost"}`} onClick={() => setPageNum(p)}>{p + 1}</button>;
          })}
          <button className="small ghost" disabled={pageNum >= totalPages - 1} onClick={() => setPageNum(pageNum + 1)}>→</button>
        </div>
      )}
    </div>
  );
}
