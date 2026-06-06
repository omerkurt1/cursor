# city-backend — Go REST + WebSocket API

Production-grade Go backend for the City Analytics hackathon project.  
Proxies and enriches data from the Python AI privacy pipeline with filtering,
pagination, statistics, real-time WebSocket scan events, rate limiting, and
graceful shutdown.

## Architecture

```
Next.js (Vercel)
   │
   │  REST  GET /api/v1/detections[?type=&min_confidence=&bbox=&limit=&offset=]
   │        GET /api/v1/detections/stats
   │        POST /api/v1/scan
   │        GET  /api/v1/scan/status
   │  WS    GET /ws  ← scan progress events
   │
city-backend (Render.com :8080)
   │
   │  HTTP proxy
   │
Python AI Pipeline (Render.com :8000)
```

## Quick Start (local)

```bash
# 1. Clone and enter the backend folder
cd backend

# 2. Download dependencies
go mod download

# 3. Run (defaults: port 8080, pipeline at localhost:8000)
go run ./cmd/server

# 4. Or with custom env vars
PIPELINE_URL=https://ai-privacy-pipeline.onrender.com \
PORT=8080 \
go run ./cmd/server
```

## Environment Variables

| Key | Default | Description |
|-----|---------|-------------|
| `PORT` | `8080` | Render.com injects this automatically |
| `PIPELINE_URL` | `http://localhost:8000` | Base URL of the Python AI pipeline |
| `CACHE_TTL_SECONDS` | `30` | How long to cache detections in-memory |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins (set to your Vercel URL in prod) |
| `RATE_LIMIT_RPS` | `30` | Max requests per second per client IP |

## API Reference

### `GET /health`

Returns service + pipeline status. Always HTTP 200 (degraded if pipeline is unreachable).

```json
{
  "status": "ok",
  "version": "0.1.0",
  "time": "2026-06-06T09:00:00Z",
  "pipeline_status": "ok"
}
```

### `GET /api/v1/detections`

Returns filtered, paginated detections.

**Query params:**

| Param | Example | Description |
|-------|---------|-------------|
| `type` | `traffic_sign` | Filter by detection type |
| `min_confidence` | `0.7` | Minimum confidence score (0–1) |
| `bbox` | `41.0,28.8,41.1,29.0` | `minLat,minLng,maxLat,maxLng` bounding box |
| `limit` | `50` | Page size (default 50, max 200) |
| `offset` | `0` | Pagination offset |

```json
{
  "data": [
    { "type": "traffic_sign", "latitude": 41.021, "longitude": 28.874, "confidence": 0.91, "timestamp": "00:01:24" }
  ],
  "total": 42,
  "source": "real",
  "cached_at": "2026-06-06T12:00:00Z"
}
```

`source` is `"real"` or `"sample"` (forwarded from pipeline's `X-Data-Source` header).

### `GET /api/v1/detections/stats`

```json
{
  "total": 42,
  "by_type": {
    "traffic_sign": 18,
    "traffic_light": 12,
    "damaged_sign": 7,
    "pothole": 5
  },
  "avg_confidence": 0.81,
  "source": "real"
}
```

### `POST /api/v1/scan`

Triggers a new scan via the Python pipeline and immediately returns `202 Accepted`.
Progress is streamed over WebSocket.

```json
{
  "lat": 41.021,
  "lng": 28.874,
  "demo_fallback": false
}
```

Returns `409 Conflict` if a scan is already running.

### `GET /api/v1/scan/status`

```json
{ "running": false, "completed": true }
```

### `GET /ws`

WebSocket endpoint. Connect and receive scan lifecycle events:

```json
{ "event": "scan_started",   "payload": { "lat": 41.021, "lng": 28.874 } }
{ "event": "scan_progress",  "payload": { "status": "running" } }
{ "event": "scan_completed", "payload": { "detection_count": 5, "source": "real" } }
{ "event": "scan_failed",    "payload": { "error": "..." } }
```

## Error Format

All errors use a consistent envelope:

```json
{ "error": "rate limit exceeded", "code": "RATE_LIMITED" }
```

| Code | HTTP Status |
|------|-------------|
| `BAD_REQUEST` | 400 |
| `PIPELINE_UNAVAILABLE` | 502 |
| `SCAN_IN_PROGRESS` | 409 |
| `RATE_LIMITED` | 429 |
| `INTERNAL_ERROR` | 500 |

## Running Tests

```bash
go test ./...
```

## Docker Build

```bash
docker build -t city-backend .
docker run -e PIPELINE_URL=http://host.docker.internal:8000 -p 8080:8080 city-backend
```

## Render.com Deployment

The `render.yaml` at the repository root defines the `city-backend` service.
Set `ALLOWED_ORIGINS` to your Vercel deployment URL in the Render dashboard.
