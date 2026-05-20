"""Public dashboard metrics."""
from fastapi import APIRouter, Request
from services import buildkit

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


@router.get("/stats")
async def get_stats(request: Request):
    return await buildkit.stats(request)
