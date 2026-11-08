# Numen Geometry Intelligence v0.22 — local development release

Preserves existing SQLite catalog, cache, background indexing, original radial-v1 endpoints, Explorer, MCP and deployment configuration.

New endpoints:
- `POST /api/v1/objects/batch` JSON `{"ids":["..."],"includeFeatures":true}`. Up to 25 catalog objects, cached features if available.
- `POST /api/v1/search/by-model/v2` JSON `{"format":"obj|stl|glb","data":"BASE64","limit":10}`. **16 KB total JSON body limit remains in effect.** Supports indexed triangle GLB (first primitive), binary or ASCII STL, triangle OBJ. Scores a bounded subset of locally analyzed models (default 20), not the entire catalog. Response marks partial coverage. This is an experimental uncalibrated geometry-v2 score.
- `GET /api/v1/metrics` local in-memory request counters, route counts and latency percentiles. Do not expose this endpoint publicly without access control.

Existing `radial-v1` analysis is retained so previously computed features are not lost. The experimental v2 algorithm has not been accuracy-benchmarked on a labeled corpus; it is not a proof of 3D identity.

**Known limitations**: No full-catalog v2 index or scheduled v2 backfill; no external observability backend; GraphQL indexer already has retry/backoff and status fields, but its resilience has not been load-tested. Existing OpenAPI/MCP metadata is not yet updated to describe new endpoints. This is a local development build, **not** a fully verified production-final release.

Install: `npm install`, `npm test`, `npm start`. Keep `data/` and `cache/` from the prior installation. Bind to localhost until security review and reverse-proxy rate limiting are complete.
