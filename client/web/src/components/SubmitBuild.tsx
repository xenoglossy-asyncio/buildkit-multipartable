import { useState, useRef, type DragEvent } from "react";
import { submitBuild, submitBulkBuild, type Build, cancelBuild } from "../lib/api";
import { buildTarGz, readFolder } from "../lib/tar";

interface Props {
  onSubmitted: (build: Build) => void;
}

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

  const filesRef = useRef<File[] | null>(null);

  async function doSubmit() {
    if (!filesRef.current || filesRef.current.length === 0) {
      setError("Drop a folder or select files first");
      return;
    }
    setError("");
    setBulkResult("");
    setUploading(true);
    try {
      // Build tar from selected files
      const entries: { name: string; data: Uint8Array }[] = [];
      for (const f of filesRef.current) {
        const path = f.webkitRelativePath || f.name;
        const buf = new Uint8Array(await f.arrayBuffer());
        entries.push({ name: path, data: buf });
      }
      const tar = await buildTarGz(entries);

      // Find Dockerfile content from entries
      let dfContent = dockerfile;
      for (const e of entries) {
        const base = e.name.split("/").pop();
        if (base === dockerfile || base === "Dockerfile") {
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

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);

    const items = e.dataTransfer.items;
    const first = items?.[0];
    if (first && typeof first.webkitGetAsEntry === "function") {
      const entry = first.webkitGetAsEntry();
      if (entry) {
        readFolder(entry).then((entries) => {
          const files: File[] = entries.map(
            (e) => new File([e.data as BlobPart], e.name.split("/").pop() || e.name),
          );
          (files as any)._paths = entries.map((e) => e.name);
          filesRef.current = files;
          setFileName(`${entry.name} (${entries.length} files)`);
          setError("");
        });
        return;
      }
    }

    // Fallback: plain file list
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    filesRef.current = files;
    setFileName(`${files.length} files selected`);
    setError("");
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>Submit Build</h2>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setMode("single")}
            style={{
              fontSize: 12,
              padding: "4px 12px",
              background: mode === "single" ? undefined : "#30363d",
            }}
          >
            Single
          </button>
          <button
            onClick={() => setMode("bulk")}
            style={{
              fontSize: 12,
              padding: "4px 12px",
              background: mode === "bulk" ? undefined : "#30363d",
            }}
          >
            Bulk
          </button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#8b949e", marginBottom: 12 }}>
        {mode === "single"
          ? "Drop a folder containing one Dockerfile. Browser will archive and upload automatically."
          : "Bulk: drop a root folder with subdirectories — one build per Dockerfile found."}
      </p>

      <div
        className={`dropzone ${dragOver ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <b>Drop a folder here</b>
        <p style={{ marginTop: 8 }}>
          Or{" "}
          <label
            style={{
              color: "#58a6ff",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            browse
            <input
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  filesRef.current = Array.from(e.target.files);
                  setFileName(
                    `${e.target.files.length} files selected`,
                  );
                }
              }}
              multiple
            />
          </label>
        </p>
      </div>
      <div className="file-label">{fileName || "No folder selected"}</div>

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
            placeholder="registry:80/bulk-"
            style={{ flex: 1 }}
          />
        )}
        <button onClick={doSubmit} disabled={uploading}>
          {uploading ? "Uploading..." : "Submit"}
        </button>
        {buildId && (
          <button className="danger" onClick={doCancel}>
            Cancel
          </button>
        )}
      </div>

      {bulkResult && (
        <div style={{ marginTop: 8, color: "#3fb950", fontSize: 12 }}>
          {bulkResult}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
