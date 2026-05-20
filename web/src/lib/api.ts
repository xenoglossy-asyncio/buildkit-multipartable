const BASE = "/api/v1";

function apiKey(): string {
  return localStorage.getItem("dtbuild_api_key") || "";
}

async function fetchJSON(path: string, init?: RequestInit): Promise<any> {
  const headers: Record<string, string> = {};
  if (init?.headers) {
    for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
      headers[k] = v;
    }
  }
  const key = apiKey();
  if (key) headers["X-Api-Key"] = key;

  const res = await fetch(BASE + path, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export interface Build {
  id: string;
  status: "pending" | "building" | "succeeded" | "failed" | "cancelled" | "timed_out";
  fingerprint: string;
  worker_id: string;
  context_key: string;
  dockerfile: string;
  image_tag: string;
  args: Record<string, string>;
  logs: string;
  error: string;
  retry_count: number;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  user_id?: string;
  cache_hit_rate?: number;
}

export interface BuildPage {
  builds: Build[];
  total: number;
  limit: number;
  offset: number;
}

export function listBuilds(limit = 20, offset = 0): Promise<BuildPage> {
  return fetchJSON(`/builds?limit=${limit}&offset=${offset}`);
}

export function getBuild(id: string): Promise<Build> {
  return fetchJSON(`/builds/${id}`);
}

export async function submitBuild(
  context: Uint8Array,
  dockerfile: string,
  tag: string,
  args?: Record<string, string>,
): Promise<Build> {
  const form = new FormData();
  form.append("context", new Blob([context as any], { type: "application/x-tar" }), "context.tar.gz");
  form.append("dockerfile", dockerfile);
  form.append("image_tag", tag);
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      form.append(`arg.${k}`, v);
    }
  }
  return fetchJSON("/builds", { method: "POST", body: form });
}

export interface BulkResult {
  count: number;
  builds: Build[];
}

export async function submitBulkBuild(
  context: Uint8Array,
  tagPrefix: string,
): Promise<BulkResult> {
  const form = new FormData();
  form.append("context", new Blob([context as any], { type: "application/x-gtar" }), "context.tar.gz");
  form.append("tag_prefix", tagPrefix);
  const res = await fetch(BASE + "/builds/bulk", {
    method: "POST",
    body: form,
    headers: apiKey() ? { "X-Api-Key": apiKey() } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function cancelBuild(id: string): Promise<void> {
  await fetchJSON(`/builds/${id}`, { method: "DELETE" });
}

export function streamLogs(
  id: string,
  onLine: (line: string) => void,
  onError: (e: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE}/builds/${id}/logs?stream=true`);
  es.onmessage = (e) => onLine(e.data);
  es.onerror = onError;
  return es;
}

export function setApiKey(key: string) {
  localStorage.setItem("dtbuild_api_key", key);
}
