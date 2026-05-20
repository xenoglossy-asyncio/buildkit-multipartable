import { useState, useEffect, useRef } from "react";
import { streamLogs, type Build } from "../lib/api";

interface Props {
  build: Build;
  onClose: () => void;
}

export default function LogModal({ build, onClose }: Props) {
  const [logs, setLogs] = useState(build.logs || "");
  const [useSSE, setUseSSE] = useState(build.status === "building" || build.status === "pending");
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(build.logs || "");
  }, [build.logs]);

  useEffect(() => {
    if (!useSSE) return;
    // SSE stream sends all existing logs on connect, so clear to avoid duplication
    setLogs("");
    const es = streamLogs(
      build.id,
      (line) => setLogs((prev) => prev + line + "\n"),
      () => es.close()
    );
    return () => es.close();
  }, [build.id, useSSE]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 32,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 1200,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>
            Build Logs <span className="build-id">{build.id.substring(0, 8)}</span>
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(build.status === "building" || build.status === "pending") && (
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={useSSE}
                  onChange={(e) => setUseSSE(e.target.checked)}
                />
                Live Stream
              </label>
            )}
            <button className="ghost small" onClick={onClose}>Close</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
          {build.image_tag} • {build.status}
          {build.error && <span style={{ color: "var(--red)", marginLeft: 8 }}>• {build.error}</span>}
        </div>
        <div className="logs" style={{ flex: 1, overflow: "auto" }}>
          {logs || <span className="logs-placeholder">No logs yet...</span>}
          <div ref={logEnd} />
        </div>
      </div>
    </div>
  );
}
