import { useState, useRef, type DragEvent } from "react";
import { submitBuild, submitBulkBuild, type Build, cancelBuild } from "../lib/api";

interface Props {
  onSubmitted: (build: Build) => void;
}

export default function SubmitBuild({ onSubmitted }: Props) {
  const [tag, setTag] = useState("registry:80/test:latest");
  const [bulkPrefix, setBulkPrefix] = useState("registry:80/bulk/");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [dockerfile, setDockerfile] = useState("Dockerfile");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string>("");

  const fileRef = useRef<File | null>(null);

  async function doSubmit() {
    if (!fileRef.current) { setError("Choose a .tar.gz file first"); return; }
    setError("");
    setBulkResult("");
    setUploading(true);
    try {
      const buf = new Uint8Array(await fileRef.current.arrayBuffer());
      if (mode === "bulk") {
        const r = await submitBulkBuild(buf, bulkPrefix);
        setBulkResult(`Created ${r.count} builds`);
        if (r.builds.length > 0) onSubmitted(r.builds[0]);
      } else {
        const b = await submitBuild(buf, dockerfile, tag);
        setBuildId(b.id);
        onSubmitted(b);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    }
    setUploading(false);
  }

  async function doCancel() {
    if (!buildId) return;
    try { await cancelBuild(buildId); } catch {}
    setBuildId(null);
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Submit Build</h2>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setMode("single")}
            style={{
              fontSize: 12, padding: "4px 12px",
              background: mode === "single" ? undefined : "#30363d",
            }}
          >
            Single
          </button>
          <button
            onClick={() => setMode("bulk")}
            style={{
              fontSize: 12, padding: "4px 12px",
              background: mode === "bulk" ? undefined : "#30363d",
            }}
          >
            Bulk
          </button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#8b949e", marginBottom: 12 }}>
        {mode === "single"
          ? "Single build from a .tar.gz containing one Dockerfile."
          : "Bulk: root .tar.gz with subdirectories — one build per Dockerfile found."}
      </p>

      <div
        className={`dropzone ${dragOver ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (!f) return;
          fileRef.current = f;
          setFileName(f.name);
          setError("");
        }}
      >
        <b>Drop .tar.gz here</b>
        <p>Use <code>tar -czf context.tar.gz ./folder/</code> or the CLI</p>
      </div>
      <div className="file-label">{fileName || "No file selected"}</div>

      <div className="row" style={{ marginTop: 12 }}>
        {mode === "single" ? (
          <>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="registry:80/image:tag"
              style={{ flex: 1 }}
            />
            <input
              value={dockerfile}
              onChange={(e) => setDockerfile(e.target.value)}
              placeholder="Dockerfile"
              style={{ width: 120 }}
            />
          </>
        ) : (
          <input
            value={bulkPrefix}
            onChange={(e) => setBulkPrefix(e.target.value)}
            placeholder="registry:80/bulk/"
            style={{ flex: 1 }}
          />
        )}
        <button onClick={doSubmit} disabled={uploading}>
          {uploading ? "Uploading..." : "Submit"}
        </button>
        {buildId && (
          <button className="danger" onClick={doCancel}>Cancel</button>
        )}
      </div>

      {bulkResult && <div style={{ marginTop: 8, color: "#3fb950", fontSize: 12 }}>{bulkResult}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
