# Numen Geometry Explorer v0.18 — Final performance update

This release preserves the English gallery, three view modes, and Geometry Intelligence APIs.

## Background geometry analysis

- Bounded concurrent feature extraction (default 2 workers; configurable 1–4).
- Existing SQLite features and cached GLB files are reused.
- Failure backoff and rate-limit cooldown; failures do not permanently block later objects.
- Paged scan of unanalyzed objects so a failed object at the head cannot starve the rest.
- Status: `GET /api/v1/analysis/status` includes active jobs, queued objects and retry count.
- Automatic analysis continues as new mining objects are indexed.

Environment variables: `NUMEN_ANALYSIS_CONCURRENCY=2`, `NUMEN_ANALYSIS_INTERVAL_MS=2500`, `NUMEN_ANALYSIS_SCAN_BATCH=250`, `NUMEN_DISABLE_ANALYSIS=1` (optional).

**Note:** GraphQL throttling, available mesh data and hardware affect completion time. Similarity searches cover only analyzed objects until background processing finishes. Avoid high concurrency against the public GraphQL endpoint.

## Install

Copy the source files over the existing project, preserving your `data/` and `cache/` directories. Use Node.js >=22.16, then `npm run start`. Run `npm test` for automated checks.

# Numen Geometry Intelligence v0.14 — English Interface and Named AI APIs

This release translates the public web interface into English and adds a clearly named API directory linking to **existing** service endpoints. It does not add the proposed geometry similarity, comparison, or feature extraction endpoints; these are explicitly marked as planned.

**Preserve your existing `data/` and `cache/` directories when updating.**

# Numen Geometry Intelligence v0.7 — Explorer geometry fix

- Reconstructs geometry using the same binary layout as Explorer: gzip vertices as Float64Array and gzip faces as Uint16Array.
- Counts are derived from decompressed payload lengths; optional GraphQL count fields are validated only when present.
- SQLite indexer walks `minedObjects(orderBy: id_DESC, limit, offset)` from the newest records until a short page indicates the end, including genesis-era objects when indexed.
- Once caught up, checks the tip periodically and restarts the duplicate-safe scan only when new objects appear.
- Gallery and AI API remain unchanged. Registry is still a separate, unconnected tab.

Start: `npm run start`. Test: `npm test`.

**Notes:** A complete chain catalogue requires the GraphQL indexer to expose all historical mined objects and for the local backfill to finish. The `backfillComplete` field reports completion. Avoid deleting the existing `data/` directory when upgrading.

# Numen Geometry Intelligence v0.5 — SQLite indexer

TypeScript + Node.js 22.16+, no Python, no npm install required for `npm run start`.

## Windows

Extract the ZIP and run from its `numen-geometry-service-ts` folder:

```powershell
npm run start
```

Open http://127.0.0.1:8000/ . The indexer starts in the background. The first catalog sync takes time; refresh the gallery to see more objects. `Ctrl+C` stops the server.

## API

- `GET /health` — API and indexer status
- `GET /api/v1/indexer/status` — indexed count, remote total, last success, error, backoff deadline
- `GET /api/v1/mined?limit=24&offset=0` — local SQLite catalog, sorted by block height descending; `sync.backfillComplete` indicates whether the initial scan has finished
- `GET /objects/{id}` — reconstruct geometry and return metadata
- `GET /objects/{id}/model?format=glb|obj|stl` — model export (cached on disk)
- `GET /registry/status` — registry not yet connected
- `GET /openapi.json` and `/llms.txt` — AI agent discovery

## Storage

`data/numen-catalog.sqlite` holds durable mined-object metadata. `cache/` holds exported meshes. Both survive restarts. To reset indexing, stop the server and delete the SQLite file (and optional WAL/SHM files).

## Rate limit protection

All GraphQL requests share a serial queue, spaced at least 2500ms apart. The background indexer retrieves up to 24 records per request and retries with increasing backoff on HTTP 429 or transient errors. The gallery listing **never calls GraphQL directly**. Model downloads not already in `cache/` still require GraphQL and may be temporarily unavailable during a rate limit.

The indexer uses `offset` pagination, persists its progress, and refreshes after completing the initial scan. Because new blocks arrive while older pages are being scanned, it uses idempotent upserts to avoid duplicates. Large-scale production indexing should eventually switch to a stable block-height cursor or a dedicated indexer feed to guarantee no gaps during reorganization/rapid block growth. This version does not guarantee exhaustive coverage until the full backfill is completed and checked.

## Configuration

- `NUMEN_GRAPHQL_URL`: GraphQL endpoint
- `NUMEN_CATALOG_DB`: SQLite path (default `./data/numen-catalog.sqlite`)
- `NUMEN_REQUEST_INTERVAL_MS`: minimum delay between GraphQL requests (default `2500`)
- `NUMEN_INDEX_PAGE_SIZE`: GraphQL page size (default `24`)
- `NUMEN_DISABLE_INDEXER=1`: disable background indexing (for tests)
- `NUMEN_GEOMETRY_CACHE`: exported model cache directory
- `HOST`, `PORT`: HTTP bind address and port

## Tests

```powershell
npm test
```

Registry models are intentionally not fabricated; their data source must be connected separately.

## v0.6 GraphQL compatibility fix

The mining indexer now requests `minedObjects(orderBy: id_DESC, limit, offset)` with minimal fields (`id`, `protocol`, `vertexCount`, `block {height hash timestamp}`), removing the unverified `identityDisplay` field. It no longer assumes `minedObjectsConnection` exists. Topology queries use Explorer's `meshTopologies(where: {id_in: [...]}) {id faces}` shape. Pagination ends when a short page is returned. The total count is the locally indexed count until a confirmed remote count source is available.

If a GraphQL HTTP 400 persists, check the detailed response logged in `/api/v1/indexer/status` and verify whether `id` and `vertexCount` are available on your live schema. Do not delete your existing SQLite catalog when upgrading.


## v0.8 gallery and search

- 100 items per gallery page, newest first, with first/previous/next/last and page jump.
- Search indexed objects by object ID, block height, miner address or miner display name: `GET /api/v1/mined?limit=100&offset=0&q=...`.
- Block metadata: hash, timestamp, author (id/identityDisplay), finality, reward, difficulty, extrinsics and events. Fields only appear when available.
- Models load lazily with a 2-request concurrency cap. Existing GLB files are cached on disk. A 100-card page may still take time to populate if geometry is not cached.
- On first v0.8 start, the indexer restarts its backfill to enrich old SQLite records with miner data. Existing objects are preserved.
- `backfillComplete` means GraphQL returned a short/empty page; this cannot prove that all chain blocks are present in the upstream index.

## v0.9 UI
- Default 24 objects per page, selectable 50/100.
- Numbered pagination, first/previous/next/last icon controls, direct page jump.
- Cards display only object ID, block height, miner, miner address, block hash and timestamp.

## v0.10 API documentation and public deployment readiness

- `/openapi.json` now reports **0.10.0** and defines the JSON response schemas for paginated mined objects, miner/block fields, sync state, indexer status, registry status and error responses. It documents `q`, `limit` (default 24), `offset`, GLB/OBJ/STL, and batch generation.
- `/llms.txt` describes search and pagination, makes partial-index limitations explicit and links to OpenAPI.
- The OpenAPI `servers` entry is **relative (`/`)** by default, so it works on localhost and behind an HTTPS reverse proxy. Set `NUMEN_PUBLIC_URL=https://your-real-host.example` only after the HTTPS endpoint is actually deployed; the service does not register DNS or issue TLS certificates.
- `HOST=0.0.0.0` allows listening on an external interface if needed, but **do not expose the API publicly without** TLS reverse proxy, access controls/rate limits, request size limits, and monitoring. Geometry generation can be resource-intensive.
- Existing SQLite data and geometry cache remain unchanged.


## v0.12 cinematic 3D previews

The gallery uses a shared, deterministic procedural stone albedo/bump texture, directional sunlight, cool rim light, ACES tone mapping, and a lightweight CSS starfield. The actual on-chain PoScan mesh remains the geometry source. Cosmetic surface detail is not encoded into downloaded GLB/OBJ/STL files. Cards load on demand with at most two concurrent model requests. No new dependencies.


## v0.13: Large 3D viewer and viewing modes
Click or press Enter on any asteroid preview to open a large viewer. Modes: Realistic (cinematic texture), Hybrid (texture plus triangle lines), Geometry (flat-shaded original PoScan mesh with triangle edges). Mouse orbit and zoom, ESC to close. Modes affect rendering only; GLB/OBJ/STL downloads and stored geometry remain unchanged.


## v0.15: Compact English interface

The duplicate API navigation buttons were removed. Developer & AI APIs is now a
collapsed disclosure beneath the mined-object search and indexing status, above
the asteroid gallery. Its three primary links are OpenAPI Specification, AI Agent
Guide and Mined Objects Catalog; all other endpoints are accessible from a nested
API reference. No backend API routes, database schema, indexer or 3D rendering
code were changed. Planned geometry-analysis endpoints remain explicitly labeled
as unimplemented. Preserve your existing `data/` and `cache/` directories when
upgrading.

## v0.16 Geometry Intelligence

The interactive 3D modal now includes Geometry Intelligence (expand the section below the viewer): Geometry Features, Find Similar, Analyze Visible Page and Compare. The site remains English-only. Existing SQLite index and GLB caches are preserved on upgrade.

Endpoints:
- `GET /api/v1/objects/{id}/features` computes and caches geometric features.
- `GET /api/v1/compare?id1=ID1&id2=ID2` computes a radial shape descriptor comparison.
- `GET /api/v1/objects/{id}/similar?limit=10` ranks only **already analyzed** objects in the local catalog.
- `POST /api/v1/analysis/prepare` with `{"ids":["ID1","ID2"]}` analyzes up to 25 objects per request to populate the feature cache.

Important: The similarity engine is a deterministic, translation/scale/rotation-invariant radial shape descriptor, **not** Spectral3D or a calibrated match probability. Radial descriptors cannot distinguish all shapes. Volume is reported only for watertight meshes; the mesh's face winding must also be consistent for the signed-volume calculation to be meaningful. Measurements use mesh coordinate units, not physical meters. Similarity search coverage grows as objects are analyzed, and does not automatically cover all indexed objects. The service may request upstream GraphQL data for uncached GLBs; rate limits can affect first-time analysis.


## v0.17 Geometry Intelligence
- Automatically analyzes indexed PoScan objects in the background (one every 7 seconds by default); geometry features persist in the existing SQLite database, without deleting the catalog.
- `GET /api/v1/analysis/status` shows progress and coverage. Set `NUMEN_DISABLE_ANALYSIS=1` to disable or `NUMEN_ANALYSIS_INTERVAL_MS=10000` to reduce background load.
- Similarity searches use cached SQLite descriptors, exclude the reference asteroid, and report exact coverage.
- Geometry Features and Compare display readable metrics; Compare also shows two interactive 3D models side by side.
- Network availability and GraphQL rate limits can delay background analysis; failed objects are retried later. Do not delete `data` or `cache` when upgrading.

## v0.19 — AI agent access (MCP)

The original Explorer and REST endpoints remain available. The new `POST /mcp` endpoint implements stateless MCP Streamable HTTP JSON-RPC (`2025-03-26`) with `initialize`, `ping`, `tools/list`, and `tools/call`. Eight read-only tools are exposed: `search_objects`, `get_object`, `get_features`, `find_similar`, `compare_objects`, `get_index_status`, `get_analysis_status`, `get_model_link`. The last tool returns a URL, not a binary file. No wallet, token, or gas is needed.

- OpenAPI 3.1: `GET /openapi.json`
- AI guide: `GET /llms.txt`
- Crawling hints: `GET /robots.txt`
- MCP: `POST /mcp`

Start locally with `npm install && npm start`. To expose externally, deploy behind HTTPS, set `HOST=0.0.0.0` and `NUMEN_PUBLIC_URL=https://api.your-domain.example` and configure reverse-proxy abuse protections (request throttling, limits, monitoring). Do not blindly expose the development server. For production, assess MCP client origin and authentication requirements, and implement per-client rate limits. The current endpoint is stateless and supports JSON responses, not SSE streaming. Not all MCP clients accept this transport mode.

MCP smoke test:

```bash
curl -s http://127.0.0.1:8000/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`npm test` includes MCP protocol tests. Tool results reflect the local catalog; indexing and feature analysis may be incomplete. The independent 3D object registry remains unconnected. ChatGPT and Gemini will not automatically discover or invoke the service without a supported connector/tool configuration.


## v0.20 — HTTPS production packaging

Added `Dockerfile`, `compose.yaml`, `Caddyfile`, `.env.example`, and [`DEPLOYMENT.md`](DEPLOYMENT.md) with VPS/DNS/TLS deployment steps. The `/.well-known/openapi.json` endpoint redirects to `/openapi.json`. v0.19's stale API version assertion is corrected. **This ZIP is deployment-ready, not deployed**; read the security/rate-limiting caveats before opening public access.
