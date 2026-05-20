"""Build submission, status, logs."""
import asyncio
import uuid

from fastapi import APIRouter, Request, UploadFile, Form, HTTPException, Query

from services import buildkit, s3

router = APIRouter(prefix="/api/v1", tags=["builds"])


@router.post("/builds")
async def submit_build(
    request: Request,
    context: UploadFile,
    dockerfile: str = Form(default="Dockerfile"),
    image_tag: str = Form(default=""),
):
    data = await context.read()
    build_id = str(uuid.uuid4())
    try:
        context_key = await asyncio.to_thread(s3.upload_context, data, build_id)
        result = await buildkit.submit_build(request, build_id, context_key, dockerfile, image_tag)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/builds/bulk")
async def submit_bulk(
    request: Request,
    context: UploadFile,
    tag_prefix: str = Form(default="registry:80/bulk-"),
):
    data = await context.read()
    try:
        context_key = await asyncio.to_thread(s3.upload_bulk_context, data)
        result = await buildkit.submit_bulk(request, context_key, tag_prefix)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/builds")
async def list_builds(request: Request, limit: int = Query(default=50)):
    try:
        return await buildkit.list_builds(request, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/builds/{build_id}")
async def get_build(request: Request, build_id: str):
    try:
        return await buildkit.get_build(request, build_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/builds/{build_id}/logs")
async def get_build_logs(request: Request, build_id: str):
    try:
        return await buildkit.get_build_logs(request, build_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/builds/{build_id}")
async def cancel_build(request: Request, build_id: str):
    try:
        await buildkit.cancel_build(request, build_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
