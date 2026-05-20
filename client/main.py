"""dtbuildkit user-facing service."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import auth, builds, dashboard, admin

BUILD_SERVICE = os.getenv("BUILD_SERVICE", "http://server:8640")
ADMIN_KEY = os.getenv("DTBUILD_ADMIN_KEY", "fucking-admin-dtbuildkit")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import httpx
    app.state.build_client = httpx.AsyncClient(base_url=BUILD_SERVICE, timeout=60.0)
    yield
    await app.state.build_client.aclose()


app = FastAPI(
    title="dtbuildkit API",
    version="1.0",
    description="Distributed BuildKit image builder — user-facing service",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(auth.router)
app.include_router(builds.router)
app.include_router(dashboard.router)
app.include_router(admin.router)

# Serve web frontend static files (built Vite output)
web_dir = os.path.join(os.path.dirname(__file__), "web", "dist")
if os.path.isdir(web_dir):
    app.mount("/", StaticFiles(directory=web_dir, html=True), name="frontend")
