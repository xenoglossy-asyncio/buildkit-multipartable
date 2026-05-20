import { useState, useEffect, useRef } from "react";
import { getBuild, streamLogs, type Build, cancelBuild } from "../lib/api";

const STATUS_CLASS: Record<string, string> = {
  pending: "status-pending",
  building: "status-building",
  succeeded: "status-succeeded",
  failed: "status-failed",
  cancelled: "status-cancelled",
  timed_out: "status-failed",
};

interface Props {
  id: string;
  onClose: () => void;
}

export default function BuildDetail({ id, onClose }: Props) {
  const [build, setBuild] = useState<Build | null>(null);
  const [logs, setLogs] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getBuild(id).then(setBuild).catch(() => {});
    const t = setInterval(() => getBuild(id).then(setBuild).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [id]);
  useEffect(() => { setLogs(build?.logs || ""); }, [build]);

  useEffect(() => {
    const es = streamLogs(id,
      (line) => setLogs((prev) => prev + line + "\n"),
      () => es.close(),
    );
    return () => es.close();
  }, [id]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="card detail-card">
      <div className="detail-header">
        <h2>Build <span className="build-id">{id.substring(0, 8)}</span></h2>
        <div style={{ display: "flex", gap: 8 }}>
          {build?.status === "building" && (
            <button className="danger" onClick={() => cancelBuild(id).catch(() => {})}>Cancel</button>
          )}
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      {build && (
        <div className="detail-meta">
          <span>{build.image_tag}</span>
          <span className={`build-status ${STATUS_CLASS[build.status] || ""}`}>{build.status}</span>
          {build.error && <span className="detail-error">{build.error.substring(0, 120)}</span>}
        </div>
      )}
      <div className="logs">
        {logs || <span className="logs-placeholder">Waiting for logs...</span>}
        <div ref={logEnd} />
      </div>
    </div>
  );
}
