import { useState, useRef, DragEvent } from "react";
import { submitBuild, type Build, cancelBuild } from "../lib/api";

interface Props {
  onSubmitted: (build: Build) => void;
}

export default function SubmitBuild({ onSubmitted }: Props) {
  const [tag, setTag] = useState("registry:80/test:latest");
  const [dockerfile, setDockerfile] = useState("Dockerfile");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [buildId, setBuildId] = useState<string | null>(null);

  const fileRef = useRef<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function doSubmit() {
    if (!fileRef.current) { setError("Choose a .tar.gz file first"); return; }
    setError("");
    setUploading(true);
    try {
      const buf = new Uint8Array(await fileRef.current.arrayBuffer());
      const b = await submitBuild(buf, dockerfile, tag);
      setBuildId(b.id);
      onSubmitted(b);
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
      <h2>Submit Build</h2>
      <div
        className={`dropzone ${dragOver ? "drag" : ""}`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (!f) return;
          if (!f.name.endsWith(".tar.gz") && !f.name.endsWith(".tgz")) {
            setError("Use the CLI to build a .tar.gz of your context: dtbuild submit ./folder");
            return;
          }
          fileRef.current = f;
          setFileName(f.name);
          setError("");
        }}
      >
        <b>Drop .tar.gz here</b>
        <p>Use <code>tar -czf context.tar.gz ./folder/</code> or the CLI</p>
        <input
          ref={fileInput}
          type="file"
          accept=".tar.gz,.tgz,.tar"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            fileRef.current = f;
            setFileName(f.name);
          }}
        />
      </div>
      <div className="file-label">{fileName || "No file selected"}</div>

      <div className="row" style={{ marginTop: 12 }}>
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
        <button onClick={doSubmit} disabled={uploading}>
          {uploading ? "Uploading..." : "Submit"}
        </button>
        {buildId && (
          <button className="danger" onClick={doCancel}>Cancel</button>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
