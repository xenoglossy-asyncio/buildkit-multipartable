"""Admin endpoints: quotas, keys, health."""
import os
from fastapi import APIRouter, Request, HTTPException, Header
from pydantic import BaseModel

from services import buildkit

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

ADMIN_KEY = os.getenv("DTBUILD_ADMIN_KEY", "fucking-admin-dtbuildkit")


def verify_admin(x_admin_key: str = Header(default="")):
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=401, detail="unauthorized")
    return x_admin_key


class QuotaInput(BaseModel):
    max_concurrent: int = 5
    max_daily: int = 100
    max_storage_bytes: int = 0
    max_timeout_sec: int = 1800


class KeyInput(BaseModel):
    user_id: str


@router.get("/stats")
async def stats(request: Request, _: str = Header(default="", alias="x-admin-key")):
    try:
        resp = await buildkit.build_client(request).get("/api/v1/admin/stats")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/health")
async def health(request: Request, _: str = Header(default="", alias="x-admin-key")):
    try:
        return await buildkit.admin_health(request)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/quotas/{user_id}")
async def get_quota(request: Request, user_id: str, _: str = Header(default="", alias="x-admin-key")):
    try:
        return await buildkit.get_quota(request, user_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/quotas/{user_id}")
async def set_quota(request: Request, user_id: str, quota: QuotaInput, _: str = Header(default="", alias="x-admin-key")):
    try:
        return await buildkit.set_quota(request, user_id, quota.model_dump())
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/quotas/{user_id}")
async def delete_quota(request: Request, user_id: str, _: str = Header(default="", alias="x-admin-key")):
    try:
        await buildkit.delete_quota(request, user_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/keys")
async def list_keys(request: Request, _: str = Header(default="", alias="x-admin-key")):
    try:
        return await buildkit.list_keys(request)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/keys")
async def create_key(request: Request, body: KeyInput, _: str = Header(default="", alias="x-admin-key")):
    try:
        return await buildkit.create_key(request, body.user_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/keys/{user_id}")
async def revoke_key(request: Request, user_id: str, _: str = Header(default="", alias="x-admin-key")):
    try:
        await buildkit.revoke_key(request, user_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
