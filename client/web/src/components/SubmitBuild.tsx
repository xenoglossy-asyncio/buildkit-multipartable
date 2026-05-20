import { useState, useRef, type DragEvent } from "react";
import { submitBuild, submitBulkBuild, type Build } from "../lib/api";
import { buildTarGz, readFolder, type TarEntry } from "../lib/tar";

interface Props { onSubmitted: (build: Build) => void; }

export default function SubmitBuild({ onSubmitted }: Props) {
  const [tag, setTag] = useState("registry:80/test:latest");
  const [bulkPrefix, setBulkPrefix] = useState("registry:80/bulk-");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [dockerfile, setDockerfile] = useState("Dockerfile");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [buildId, setBuildId] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState("");

  // Store tar entries directly (preserves directory paths)
  const entriesRef = useRef<TarEntry[] | null>(null);

  async function doSubmit() {
    const entries = entriesRef.current;
    if (!entries || entries.length === 0) { setError("Drop a folder or select one first"); return; }
    setError(""); setBulkResult(""); setUploading(true);
    try {
      // Strip root folder name from all paths so Dockerfile/COPY references work
      const cleaned = entries.map(e => {
        const idx = e.name.indexOf("/");
        return idx > 0 ? { ...e, name: e.name.substring(idx + 1) } : e;
      });
      const tar = await buildTarGz(cleaned);

      // Find Dockerfile content
      let dfContent = dockerfile;
      for (const e of cleaned) {
        if (e.name === dockerfile || e.name === "Dockerfile" || e.name.endsWith("/" + dockerfile) || e.name.endsWith("/Dockerfile")) {
          dfContent = new TextDecoder().decode(e.data);
          break;
        }
      }

      if (mode === "bulk") {
        const r = await submitBulkBuild(tar, bulkPrefix);
        setBulkResult(`Created ${r.count} builds`);
        if (r.builds.length > 0) onSubmitted(r.builds[0]);
      } else {
        const b = await submitBuild(tar, dfContent, tag);
        setBuildId(b.id);
        onSubmitted(b);
      }
    } catch (e: any) { setError(e.message || String(e)); }
    setUploading(false);
  }

  async function doCancel() {
    if (!buildId) return;
    try { await fetch(`/api/v1/builds/${buildId}`, { method: "DELETE" }); } catch {}
    setBuildId(null);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragOver(false);
    const items = e.dataTransfer.items;
    const first = items?.[0];
    if (first && typeof first.webkitGetAsEntry === "function") {
      const entry = first.webkitGetAsEntry();
      if (entry) {
        readFolder(entry).then((entries) => {
          entriesRef.current = entries;
          setFileName(`${entry.name} (${entries.length} files)`);
          setError("");
        });
        return;
      }
    }
    // Fallback: FileList without directory structure
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    Promise.all(files.map(async (f) => ({
      name: f.webkitRelativePath || f.name,
      data: new Uint8Array(await f.arrayBuffer()),
    }))).then((entries) => {
      entriesRef.current = entries;
      setFileName(`${files.length} files`);
      setError("");
    });
  }

  function handleBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const dir = files[0].webkitRelativePath?.split("/")[0] || "";
    Promise.all(Array.from(files).map(async (f) => ({
      name: f.webkitRelativePath || f.name,
      data: new Uint8Array(await f.arrayBuffer()),
    }))).then((entries) => {
      entriesRef.current = entries;
      setFileName(dir ? `${dir} (${entries.length} files)` : `${entries.length} files`);
      setError("");
    });
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Submit Build</h2>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setMode("single")} className={`mode-btn ${mode !== "single" ? "inactive" : ""}`}>Single</button>
          <button onClick={() => setMode("bulk")} className={`mode-btn ${mode !== "bulk" ? "inactive" : ""}`}>Bulk</button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
        {mode === "single"
          ? "Drop a folder containing one Dockerfile."
          : "Bulk: root folder with subdirectories — one build per Dockerfile."}
      </p>

      <div className={`dropzone ${dragOver ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}>
        <b>Drop a folder here</b>
        <p style={{ marginTop: 8 }}>
          Or{" "}
          <label style={{ color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}>
            browse
            <input type="file" style={{ display: "none" }}
              {...{ webkitdirectory: "" } as any}
              onChange={handleBrowse} />
          </label>
        </p>
      </div>
      <div className="file-label">{fileName || "No folder selected"}</div>

      <div className="row" style={{ marginTop: 12 }}>
        {mode === "single" ? (
          <>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="registry:80/image:tag" style={{ flex: 1 }} />
            <input value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} placeholder="Dockerfile" style={{ width: 120 }} />
          </>
        ) : (
          <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} placeholder="registry:80/bulk-" style={{ flex: 1 }} />
        )}
        <button onClick={doSubmit} disabled={uploading}>{uploading ? "Uploading..." : "Submit"}</button>
        {buildId && <button className="danger" onClick={doCancel}>Cancel</button>}
      </div>

      {bulkResult && <div style={{ marginTop: 8, color: "var(--green)", fontSize: 12 }}>{bulkResult}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
