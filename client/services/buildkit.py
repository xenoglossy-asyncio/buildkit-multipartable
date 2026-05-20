"""Async HTTP client to the Go build service."""
from fastapi import Request


def build_client(request: Request):
    return request.app.state.build_client


async def stats(request: Request) -> dict:
    resp = await build_client(request).get("/api/v1/stats")
    resp.raise_for_status()
    return resp.json()


async def list_builds(request: Request, limit: int = 50) -> list:
    resp = await build_client(request).get(f"/api/v1/builds?limit={limit}")
    resp.raise_for_status()
    return resp.json()


async def get_build(request: Request, build_id: str) -> dict:
    resp = await build_client(request).get(f"/api/v1/builds/{build_id}")
    resp.raise_for_status()
    return resp.json()


async def get_build_logs(request: Request, build_id: str) -> str:
    resp = await build_client(request).get(f"/api/v1/builds/{build_id}/logs")
    resp.raise_for_status()
    return resp.text


async def submit_build(request: Request, context: bytes, dockerfile: str, image_tag: str, args: dict | None = None) -> dict:
    import io
    form = {}
    form["dockerfile"] = dockerfile
    form["image_tag"] = image_tag
    if args:
        for k, v in args.items():
            form[f"arg.{k}"] = v
    files = {"context": ("context.tar.gz", io.BytesIO(context), "application/x-tar")}
    resp = await build_client(request).post("/api/v1/builds", data=form, files=files)
    resp.raise_for_status()
    return resp.json()


async def submit_bulk(request: Request, context: bytes, tag_prefix: str) -> dict:
    import io
    files = {"context": ("context.tar.gz", io.BytesIO(context), "application/x-gtar")}
    data = {"tag_prefix": tag_prefix}
    resp = await build_client(request).post("/api/v1/builds/bulk", data=data, files=files)
    resp.raise_for_status()
    return resp.json()


async def cancel_build(request: Request, build_id: str) -> None:
    resp = await build_client(request).delete(f"/api/v1/builds/{build_id}")
    resp.raise_for_status()


async def next_build(request: Request, worker_id: str) -> dict | None:
    resp = await build_client(request).get(f"/api/v1/builds/next?worker_id={worker_id}")
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    return resp.json()


async def complete_build(request: Request, build_id: str, status: str, error: str = "", digest: str = "") -> None:
    resp = await build_client(request).post(
        f"/api/v1/builds/{build_id}/complete",
        json={"status": status, "error": error, "image_digest": digest},
    )
    resp.raise_for_status()


async def append_log(request: Request, build_id: str, line: str) -> None:
    resp = await build_client(request).post(f"/api/v1/builds/{build_id}/log", content=line)
    resp.raise_for_status()


async def worker_heartbeat(request: Request, worker: dict) -> None:
    resp = await build_client(request).post("/api/v1/workers/heartbeat", json=worker)
    resp.raise_for_status()


async def admin_health(request: Request) -> dict:
    resp = await build_client(request).get("/api/v1/admin/health")
    resp.raise_for_status()
    return resp.json()


async def get_quota(request: Request, user_id: str) -> dict:
    resp = await build_client(request).get(f"/api/v1/admin/quotas/{user_id}")
    resp.raise_for_status()
    return resp.json()


async def set_quota(request: Request, user_id: str, quota: dict) -> dict:
    resp = await build_client(request).put(f"/api/v1/admin/quotas/{user_id}", json=quota)
    resp.raise_for_status()
    return resp.json()


async def delete_quota(request: Request, user_id: str) -> None:
    resp = await build_client(request).delete(f"/api/v1/admin/quotas/{user_id}")
    resp.raise_for_status()


async def list_keys(request: Request) -> list:
    resp = await build_client(request).get("/api/v1/admin/keys")
    resp.raise_for_status()
    return resp.json()


async def create_key(request: Request, user_id: str) -> dict:
    resp = await build_client(request).post("/api/v1/admin/keys", json={"user_id": user_id})
    resp.raise_for_status()
    return resp.json()


async def revoke_key(request: Request, user_id: str) -> None:
    resp = await build_client(request).delete(f"/api/v1/admin/keys/{user_id}")
    resp.raise_for_status()


async def manual_gc(request: Request) -> dict:
    resp = await build_client(request).post("/api/v1/admin/builds/cleanup")
    resp.raise_for_status()
    return resp.json()
