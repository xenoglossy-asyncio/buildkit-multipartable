"""Public dashboard metrics — served from Redis cache, refreshed every 30s."""
import json
import logging
from fastapi import APIRouter, Request, Query
from services import buildkit
from services.cache import cache, CACHE_TTL

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["dashboard"])

ENDPOINTS = {
    "stats":          "/api/v1/stats",
    "stats:daily":    "/api/v1/stats/daily?days={days}",
    "stats:averages": "/api/v1/stats/averages",
    "stats:users":    "/api/v1/stats/users?days={days}",
    "stats:running":  "/api/v1/stats/running",
}


async def cached_get(client, key: str, url: str) -> dict | list:
    data = await cache.get(key)
    if data:
        try:
            return json.loads(data)
        except (json.JSONDecodeError, TypeError):
            log.warning("corrupted cache entry for key=%s, refetching", key)
    resp = await client.get(url)
    resp.raise_for_status()
    result = resp.json()
    await cache.set(key, json.dumps(result))
    return result


async def refresh_cache(client):
    """Background task: refresh all stats in Redis every 30s."""
    for key, url_tpl in ENDPOINTS.items():
        url = url_tpl.format(days=30) if "{days}" in url_tpl else url_tpl
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            await cache.set(key, json.dumps(resp.json()))
        except Exception as e:
            log.warning("failed to refresh cache key=%s: %s", key, e)


@router.get("/stats")
async def get_stats(request: Request):
    return await cached_get(buildkit.build_client(request), "stats", ENDPOINTS["stats"])


@router.get("/stats/daily")
async def get_daily_stats(request: Request, days: int = Query(default=14, ge=1, le=365)):
    return await cached_get(
        buildkit.build_client(request),
        f"stats:daily:{days}",
        ENDPOINTS["stats:daily"].format(days=days),
    )


@router.get("/stats/averages")
async def get_averages(request: Request):
    return await cached_get(buildkit.build_client(request), "stats:averages", ENDPOINTS["stats:averages"])


@router.get("/stats/users")
async def get_user_stats(request: Request, days: int = Query(default=30, ge=1, le=365)):
    return await cached_get(
        buildkit.build_client(request),
        f"stats:users:{days}",
        ENDPOINTS["stats:users"].format(days=days),
    )


@router.get("/stats/running")
async def get_running(request: Request):
    return await cached_get(buildkit.build_client(request), "stats:running", ENDPOINTS["stats:running"])
