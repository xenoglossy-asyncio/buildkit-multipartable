"""Public dashboard metrics."""
from fastapi import APIRouter, Request, Query
from services import buildkit

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


@router.get("/stats")
async def get_stats(request: Request):
    return await buildkit.stats(request)


@router.get("/stats/daily")
async def get_daily_stats(request: Request, days: int = Query(default=14)):
    resp = await buildkit.build_client(request).get(f"/api/v1/stats/daily?days={days}")
    resp.raise_for_status()
    return resp.json()


@router.get("/stats/averages")
async def get_averages(request: Request):
    resp = await buildkit.build_client(request).get("/api/v1/stats/averages")
    resp.raise_for_status()
    return resp.json()
