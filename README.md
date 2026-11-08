# Numen Geometry Intelligence

**Version 1.0.0 — Initial public release**

**3D Geometry Search, Analysis, Comparison & Provenance Inspection**

Numen Geometry Intelligence is an open-source TypeScript service for exploring and analyzing 3D geometry associated with the [Numen Network](https://numen-network.org/). It combines a searchable geometry catalog, interactive 3D viewers, model analysis tools, and machine-readable interfaces for AI agents.

The service can be used without a blockchain wallet, NUMN tokens, or gas fees. Blockchain data is used as an upstream source for mined objects and provenance inspection, not as a prerequisite for API consumers.

## Features

- **Geometry Explorer:** Browse mined 3D objects, inspect metadata, search by indexed identifiers, block height, or miner information, and preview meshes in 3D.
- **3D model export:** Reconstruct and download available objects in GLB, OBJ, or STL format.
- **Geometry analysis:** Inspect mesh properties, topology, geometric features, and shape descriptors.
- **Geometry comparison:** Compare two objects or uploaded meshes, including visual side-by-side inspection.
- **Similarity search:** Find approximate shape matches among objects with completed feature analysis.
- **Geometry identity:** Compute canonical geometry hashes and evaluate exact geometry matches independently of filenames.
- **Provenance inspection:** Compare available local metadata with upstream blockchain-indexer information and report verification limitations explicitly.
- **AI integration:** REST API, OpenAPI specification, AI discovery guide, and a read-only MCP interface.
- **Persistent catalog:** SQLite metadata and on-disk model caching; background indexing and feature analysis resume across restarts.

## Requirements

- Node.js **22.16 or later**
- npm
- Network access to the configured Numen GraphQL endpoint for uncached blockchain geometry

## Quick start

```bash
npm install
npm test
npm start
```

Open:

- **Explorer:** http://127.0.0.1:8000/
- **Geometry Intelligence Lab:** http://127.0.0.1:8000/ai-lab
- **OpenAPI:** http://127.0.0.1:8000/openapi.json
- **AI discovery:** http://127.0.0.1:8000/llms.txt

The initial indexing and analysis processes can take time. Their progress depends on the upstream GraphQL service, local hardware, and cache coverage.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health and indexer status |
| GET | `/api/v1/mined?limit=24&offset=0&q=` | Search and paginate mined objects |
| GET | `/api/v1/indexer/status` | Catalog indexing progress |
| GET | `/api/v1/analysis/status` | Background feature-analysis progress |
| GET | `/api/v1/analysis/v2/status` | Geometry v2 analysis coverage |
| GET | `/objects/{id}` | Object geometry and metadata |
| GET | `/objects/{id}/model?format=glb` | Export a model (also `obj`, `stl`) |
| GET | `/api/v1/objects/{id}/features` | Geometric features |
| GET | `/api/v1/objects/{id}/similar?limit=10` | Similar indexed models |
| GET | `/api/v1/compare?id1=...&id2=...` | Compare two indexed objects |
| GET | `/api/v1/objects/{id}/provenance` | Inspect available provenance evidence |
| POST | `/api/v1/geometry/hash` | Canonical geometry identity |
| POST | `/api/v1/geometry/exact-match` | Exact geometry comparison |
| POST | `/api/v1/search/by-model/v2` | Geometry v2 model search |
| POST | `/mcp` | MCP tool interface |
| GET | `/openapi.json` | Full machine-readable API specification |

Consult `/openapi.json` for request bodies, response schemas, and additional endpoints. The table above is a selected overview, not an exhaustive API contract.

## AI agents and MCP

AI clients can discover the service through `/llms.txt` and `/openapi.json`. The MCP endpoint exposes read-only tools for catalog discovery and geometry operations. Clients must explicitly configure the endpoint; publishing it does not automatically connect ChatGPT, Gemini, or other agents.

A publicly accessible deployment requires HTTPS and appropriate abuse protection. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment guidance.

## Configuration

Copy `.env.example` as a reference for available settings. Common options include:

| Variable | Purpose |
| --- | --- |
| `HOST`, `PORT` | HTTP bind address and port |
| `NUMEN_GRAPHQL_URL` | Upstream GraphQL endpoint |
| `NUMEN_CATALOG_DB` | Local SQLite database location |
| `NUMEN_GEOMETRY_CACHE` | Cached geometry files |
| `NUMEN_REQUEST_INTERVAL_MS` | Minimum spacing between GraphQL requests |
| `NUMEN_INDEX_PAGE_SIZE` | Indexer page size |
| `NUMEN_ANALYSIS_CONCURRENCY` | Background analysis worker count |
| `NUMEN_DISABLE_INDEXER` | Disable automatic indexing when set to `1` |
| `NUMEN_DISABLE_ANALYSIS` | Disable background analysis when set to `1` |
| `NUMEN_PUBLIC_URL` | Explicit public URL for deployed API documentation |

Do not commit `.env`, `data/`, `cache/`, `node_modules/`, or generated build output to GitHub. Keep `.env.example` free of credentials.

## Data preservation

- `data/` stores the persistent local catalog and analysis results.
- `cache/` stores reconstructed models and other cached artifacts.
- **Do not delete or overwrite these directories when upgrading.**
- The repository contains source code, not a prepopulated copy of the complete Numen blockchain catalog.

## Important limitations

- **Approximate similarity is not identity proof.** Shape descriptors and partial matches are candidate-search tools, not cryptographic evidence.
- **Canonical geometry equality is not blockchain provenance.** An exact geometry match does not independently establish who registered or mined an object.
- **Provenance checks depend on upstream data availability.** GraphQL errors or incomplete index data must be treated as unavailable or unverified, not successful verification. Full independent consensus-level proof is not claimed.
- **Object identifiers must not be fabricated.** Full on-chain object IDs are displayed or resolved only when supported by an explicit, authoritative mapping. Legacy catalog IDs remain usable where supported.
- **Indexing coverage can be incomplete.** GraphQL availability, rate limits, pagination, and backfill progress affect catalog completeness and search results.
- **Registered-object records are not automatically verified on-chain.** Local administrative imports and independently verified blockchain registrations must not be conflated.

## Development and testing

```bash
npm test
npm run build
```

A successful unit-test run does not by itself establish live GraphQL availability, browser compatibility, security hardening, or production readiness. Review deployment controls before exposing the API publicly.

## Project

- **Repository:** https://github.com/numen-network/numen-geometry-intelligence
- **Network:** https://numen-network.org/
- **Documentation:** [DEPLOYMENT.md](DEPLOYMENT.md)

---

**Numen Geometry Intelligence v1.0.0** is the project's initial public-facing release designation. Internal package/API version strings should be updated separately and consistently if a full semantic-version migration is intended.
