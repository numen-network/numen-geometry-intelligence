# Numen Geometry Intelligence API v0.21.0

New AI endpoints:
- POST `/api/v1/search/by-model` JSON `{"obj":"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3", "limit":10}`. Triangulated OBJ text only, max 16 KB, 65,536 vertices. Not persisted. Compares with locally analyzed cached objects only.
- POST `/api/v1/search/by-features` JSON `{"filters":{"minVertices":2000,"watertight":true},"limit":24,"offset":0}`. Filters only analyzed objects.
- Rate limiting: `NUMEN_RATE_LIMIT_PER_MINUTE` (default 90 per socket IP), `NUMEN_MAX_ACTIVE_REQUESTS` (default 24). Request bodies capped at 16 KB.

**Deployment note:** Behind Cloudflare Tunnel, Node may see every request as 127.0.0.1. The built-in limiter is not a substitute for Cloudflare WAF/rate limiting, and public access should remain disabled until configured. Existing `data` and `cache` should be preserved. No API key required.
