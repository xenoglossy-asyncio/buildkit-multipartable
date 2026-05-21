# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**dtbuildkit** is a distributed, cache-aware Docker image build service designed for high-throughput agentic code evaluation workloads (thousands to tens of thousands of builds per day). It uses BuildKit workers with consistent hash scheduling for cache affinity and S3-backed registry storage.

## Repository Layout

The repository is organized as three sibling sub-projects at the root:

- `server/` — Go build engine (contains `cmd/`, `internal/`, `pkg/`, `go.mod`, `Dockerfile`, `testdata/`). Hosts the API server, worker, and CLI binaries.
- `api/` — Python FastAPI gateway (`main.py`, `routers/`, `services/`, `pyproject.toml`, `Dockerfile`). Managed with `uv`.
- `web/` — React + TypeScript + Vite frontend (`src/`, `nginx.conf`, `Dockerfile`). Built into a static bundle served by an nginx container.
- `deploy/` — Shared deployment artifacts: `docker-compose.yaml` lives at repo root; `deploy/k8s/` holds Kubernetes manifests; `deploy/` also contains `buildkitd.toml`, `registry-config.yml`, `htpasswd`, etc.

## Architecture

Four-tier microservice architecture:

1. **Web** (nginx, sourced from `web/`) — Static SPA + reverse proxy on port 3000
   - Serves React production build
   - Proxies `/api/*` to FastAPI, SSE passthrough (`proxy_buffering off`)
   - SPA fallback routing (`try_files`)
   - Immutable cache headers for `/assets/`

2. **API** (FastAPI, sourced from `api/`) — API gateway on port 8100 (host) / 3000 (container)
   - Auth (DB-backed API keys), quota enforcement, API key management
   - Direct PostgreSQL access via asyncpg (stats, builds, quotas, keys)
   - Uploads build contexts directly to S3 (boto3)
   - Sends JSON metadata to Go server for build submission only
   - Redis-cached stats (30s TTL, background refresh)

3. **Server** (Go + chi, sourced from `server/`) — Internal build engine on port 8640
   - Build CRUD, scheduling, worker management
   - SSE log streaming, Prometheus metrics
   - No auth, no quotas, no stats queries (pure build engine)

4. **Worker** (Go + buildkitd subprocess, sourced from `server/`) — Build execution
   - Polls server for next build via consistent hash ring
   - Downloads contexts from S3 (HTTP fallback via server)
   - Executes `buildctl build`, streams logs to server
   - Shares buildkitd daemon, registry-backed cache

**Supporting services:**
- PostgreSQL 16 (builds, workers, quotas, api_keys)
- Redis 7 (stats cache)
- Registry:2 (S3-backed OCI storage)
- MinIO/S3 (build context storage + registry backend)
- BuildKit daemon (shared by all workers)

## Development Setup

### Local Development (Docker Compose)

The project runs via `docker-compose.yaml` with 5 workers by default:

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f server
docker compose logs -f worker

# Rebuild after code changes
docker compose up -d --build

# Stop all services
docker compose down
```

**Service URLs:**
- Web (nginx SPA): http://localhost:3000
- API (FastAPI): http://localhost:8100
- Server (Go API): http://localhost:8640
- Registry: http://localhost:5000
- PostgreSQL: localhost:5432 (user: dtbuild, pass: dtbuild, db: dtbuildkit)
- Redis: localhost:6379

### Frontend Development

React + TypeScript + Vite frontend in `web/`:

```bash
cd web
npm install
npm run dev          # Dev server with HMR
npm run build        # Production build
npm run lint         # ESLint
```

Frontend is served by a dedicated nginx container (`web` service) in production. Built via `web/Dockerfile` (multi-stage: Node 22 → nginx:alpine). Nginx proxies `/api/*` requests to FastAPI.

### Backend Development

**Go server/worker (run from `server/`):**
```bash
cd server

# Build all binaries
go build -o dtbuild ./cmd/dtbuild
go build -o dtbuild-server ./cmd/dtbuild-server
go build -o dtbuild-worker ./cmd/dtbuild-worker

# Run tests (still inside server/)
go test ./...                           # All tests
go test ./internal/scheduler            # Single package
go test -v -run TestFromDockerfile ./internal/fingerprint  # Single test

# Run server locally (requires PostgreSQL + S3)
./dtbuild-server --addr=:8640 \
  --db=postgres://dtbuild:dtbuild@localhost:5432/dtbuildkit?sslmode=disable \
  --blobs=/tmp/blobs

# Run worker locally (requires buildkitd)
./dtbuild-worker --server=http://localhost:8640 \
  --buildkit=unix:///run/buildkit/buildkitd.sock \
  --workdir=/tmp/worker \
  --cache-registry=localhost:5000/cache
```

**FastAPI gateway (run from `api/`):**
```bash
cd api
uv sync              # Install dependencies
uv run uvicorn main:app --reload --port 8100

# Environment variables
export DATABASE_URL=postgres://dtbuild:dtbuild@localhost:5432/dtbuildkit
export BUILD_SERVICE=http://localhost:8640
export DTBUILD_ADMIN_KEY=fucking-admin-dtbuildkit
export REDIS_URL=redis://localhost:6379
```

### CLI Tool

```bash
# Build CLI (must be run inside server/)
cd server && go build -o dtbuild ./cmd/dtbuild

# Submit build
export DTBUILD_API_KEY=your-key
./dtbuild submit -f Dockerfile -t myimage:latest

# Submit with context folder
./dtbuild submit -f Dockerfile -c ./context -t myimage:latest

# Check status
./dtbuild status <build-id>

# Stream logs
./dtbuild logs <build-id>

# List builds
./dtbuild list
```

## Key Internal Packages

All Go packages live under `server/internal/`. Paths below are relative to `server/`.

### `internal/scheduler`
Consistent hash ring with virtual nodes (150 replicas per worker). Routes builds to workers based on Dockerfile fingerprint for cache affinity. Affinity scoring considers:
- Cache key match (worker has seen this Dockerfile before)
- Worker status (idle > busy)
- Load balancing (fewer builds processed)

### `internal/queue`
Priority queue for pending builds. Higher priority = processed first. Supports:
- Push/Pop with priority
- Peek by affinity score
- Remove by ID
- Backpressure (max 10K queued)

### `internal/fingerprint`
Dockerfile content fingerprinting for cache affinity. Extracts:
- Base image (FROM lines)
- Package installs (RUN apt/apk/pip/npm)
- COPY/ADD sources
- Multi-stage dependencies

Produces stable SHA256 hash used by scheduler.

### `internal/buildkit`
Subprocess wrapper for `buildctl build`. Uses `--progress=rawjson` to get structured JSON output with per-vertex `cached` boolean. Computes cache hit rate from user steps (matching `[M/N]` pattern, excluding FROM) and reconstructs human-readable logs from raw JSON.

### `internal/oss`
S3/MinIO blob store for build contexts. Supports local filesystem fallback.

### `internal/repo`
PostgreSQL persistence layer using pgx/v5. Tables:
- `builds` — build records with status, logs, cache_hit_rate
- `workers` — worker registration, heartbeat, cache keys
- `quotas` — per-user limits (managed by FastAPI, read by Go for reference)
- `api_keys` — API key hashes (managed entirely by FastAPI)

### `internal/api`
HTTP handlers (chi router), SSE log broker, Prometheus metrics. No auth, no stats, no quota enforcement.

## Build Lifecycle

1. **pending** — Submitted, waiting for worker
2. **building** — Assigned to worker, buildctl running
3. **succeeded** / **failed** / **cancelled** / **timed_out** — Terminal states

**Reassignment:** Builds stuck in `building` for >60s (worker heartbeat timeout) are reassigned.

**Timeout:** Builds exceeding `timeout_seconds` (default 600s) marked `timed_out`.

**GC:** Completed builds deleted after 24h (maintenance loop).

## Cache Hit Rate

Computed by the worker at build time using `buildctl --progress=rawjson`. Each vertex in the JSON output has a `cached` boolean field. Only user steps matching `[M/N]` pattern are counted (excludes `[internal]` load metadata steps and `FROM` steps, since FROM cache status reflects base image layer availability in buildkitd, not build cache affinity). The worker reports the computed rate to the server via the build completion API.

```
cache_hit_rate = cached_user_steps / total_user_steps * 100
```

A sentinel value of -1 means cache rate was not computed (e.g., build failed before completion).

Stored in `builds.cache_hit_rate` column. Stats queries read directly from DB.

## Frontend Architecture

React SPA with tab-based navigation:
- **Dashboard** — Real-time stats (builds/hour, success rate, cache hit rate, worker status)
- **History** — 24h build timeline chart
- **Submit** — Dockerfile upload or folder upload (tar.gz in browser)
- **Builds** — Build list + detail panel with SSE log streaming
- **Admin** — Quotas, API keys, health checks (admin only)

**Mobile responsive:** CSS media queries at 768px (tablet) and 480px (phone) breakpoints. Progressive column hiding for build list, single-column admin grid, near-fullscreen log modal, 44px touch targets on phone.

**sessionStorage caching:** Each tab caches data in sessionStorage. Tab switches show cached data instantly, then refresh in background.

## Docker Build Contexts

- **Server / Worker image:** built from `server/` (`docker build -t dtbuildkit:latest ./server`). The `server/Dockerfile` produces a single image embedding `dtbuild`, `dtbuild-server`, and `dtbuild-worker`.
- **API image:** built from `api/` (`docker build -t dtbuildkit-api:latest ./api`). FastAPI service installed via `uv`.
- **Web image:** built from `web/` (`docker build -t dtbuildkit-web:latest ./web`). Multi-stage: Node 22 → nginx:alpine; static bundle is served by nginx with `/api/*` reverse-proxied to the FastAPI service.
- `docker-compose.yaml` at the repo root wires these contexts together (`build: ./server`, `build: ./api`, `build: ./web`).

## Environment Variables

### Go Server/Worker
- `S3_ENDPOINT` — MinIO/S3 endpoint (e.g., `minio:9000`)
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` — S3 credentials
- `S3_BUCKET` — Context bucket (default: `dtbuildkit`)
- `S3_USE_SSL` — Use HTTPS for S3 (default: `false`)
- `DTBUILD_ADMIN_KEY` — Admin API key

### FastAPI Gateway
- `DATABASE_URL` — PostgreSQL connection for asyncpg (default: `postgres://dtbuild:dtbuild@postgres:5432/dtbuildkit`)
- `BUILD_SERVICE` — Go server URL for build submission/cancel (default: `http://server:8640`)
- `DTBUILD_ADMIN_KEY` — Admin key (env fallback for auth)
- `REDIS_URL` — Redis connection (default: `redis://redis:6379`)
- `S3_ENDPOINT` — MinIO/S3 endpoint for direct context upload
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` — S3 credentials
- `S3_BUCKET` — Context bucket (default: `dtbuildkit`)
- `S3_USE_SSL` — Use HTTPS for S3 (default: `false`)

## Testing

Go tests live inside `server/`; run them from that directory:

```bash
cd server

# Run all Go tests
go test ./...

# Run with verbose output
go test -v ./internal/scheduler

# Run specific test
go test -run TestConsistentHash ./internal/scheduler

# Run tests with race detector
go test -race ./...
```

Test coverage:
- `internal/fingerprint` — Dockerfile parsing, hash stability
- `internal/queue` — Priority queue operations
- `internal/scheduler` — Consistent hashing, affinity scoring

## Deployment Notes

**Docker Compose (dev):**
- 5 workers by default (worker, worker-2, worker-3, worker-4, worker-5)
- Shared buildkitd via volume mount (`buildkit-sock`)
- Registry on port 5000 (S3-backed via MinIO)

**Kubernetes (prod):**
- See `deploy/k8s/` for manifests
- HPA scales workers based on pending queue depth
- Registry backend replicas for Docker Hub rate limit mitigation

**Current deployment on this machine:**
- Running via Docker Compose
- 5 workers active
- Web (nginx) on port 3000, API (FastAPI) on port 8100, Server on port 8640
- PostgreSQL on 5432, Redis on 6379, Registry on 5000, MinIO on 9000

## Key Design Decisions

**Decoupled service responsibilities:** Go server is a pure build engine (builds, logs, scheduling, workers). FastAPI owns all user-facing logic: auth, quotas, API keys, stats. FastAPI connects directly to PostgreSQL via asyncpg. Go server is only called for build submission, cancellation, and SSE log streaming.

**DB-backed API keys:** API keys stored as SHA-256 hashes in PostgreSQL `api_keys` table. Validated at the FastAPI layer. Env var `DTBUILD_ADMIN_KEY` serves as fallback.

**Quota enforcement in FastAPI:** Per-user limits (concurrent + daily) checked in FastAPI before forwarding build submission to Go. Quotas managed via admin API, stored in PostgreSQL.

**Cache hit rate in DB:** Worker computes cache rate from `buildctl --progress=rawjson` structured output (per-vertex `cached` boolean, user steps only, excluding FROM). Reported to server at build completion, stored in column. No log parsing at query time.

**Redis stats cache:** FastAPI queries PostgreSQL directly for stats, caches results in Redis every 30s. Frontend reads from Redis → instant response.

**sessionStorage for tabs:** Dashboard/History/Builds/Admin cache data in sessionStorage. Tab switches show cached data instantly.

**SSE log streaming:** Worker streams buildctl stderr to server, server broadcasts to SSE subscribers. Completed logs include proper `\n` separators.

**Folder upload:** Browser reads files recursively via `webkitGetAsEntry`, builds tar.gz in JS using `CompressionStream`, uploads to server.

**Consistent hash scheduling:** Dockerfile fingerprint → hash ring → worker assignment. Workers with matching cache keys scored higher.

**S3 as context bridge:** FastAPI uploads build contexts directly to S3 via boto3. Go server receives only JSON metadata (build_id + context_key). Workers download contexts from S3 directly (minio-go client with HTTP fallback via server's `/api/v1/blobs/{key}`). Eliminates double file transfer through the Go server.

**Nginx frontend split:** Dedicated nginx container serves the React SPA and reverse proxies `/api/*` to FastAPI. Separates static asset serving from application logic. Enables browser caching with immutable asset headers and SSE passthrough with `proxy_buffering off`.
