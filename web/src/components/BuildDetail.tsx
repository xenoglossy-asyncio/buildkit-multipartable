import { useState, useEffect, useRef } from "react";
import { getBuild, streamLogs, type Build, cancelBuild } from "../lib/api";

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
  }, [id]);

  useEffect(() => {
    setLogs(build?.logs || "");
  }, [build]);

  useEffect(() => {
    const es = streamLogs(
      id,
      (line) => setLogs((prev) => prev + line + "\n"),
      () => { es.close(); },
    );
    return () => es.close();
  }, [id]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleCancel() {
    try { await cancelBuild(id); } catch {}
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Build {id.substring(0, 8)}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {build?.status === "building" && (
            <button className="danger" onClick={handleCancel} style={{ fontSize: 12, padding: "4px 12px" }}>Cancel</button>
          )}
          <button onClick={onClose} style={{ fontSize: 12, padding: "4px 12px", background: "#30363d" }}>Close</button>
        </div>
      </div>
      {build && (
        <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 8 }}>
          {build.image_tag} &middot; {build.status}
          {build.error && <span style={{ color: "#f85149" }}> &middot; {build.error.substring(0, 120)}</span>}
        </div>
      )}
      <div className="logs">
        {logs || <span style={{ color: "#484f58" }}>Waiting for logs...</span>}
        <div ref={logEnd} />
      </div>
    </div>
  );
}
