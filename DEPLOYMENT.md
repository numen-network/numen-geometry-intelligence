# Numen Geometry Intelligence API v0.20 — public HTTPS deployment

The project does **not** configure DNS, provision a VPS, or deploy itself. The hostname is a proposed deployment target, not a claim that it is live. The service remains free and walletless; AI clients must explicitly configure the MCP endpoint.

## Prerequisites
- A Linux VPS with a public IPv4 address, Docker Engine and Docker Compose plugin.
- DNS control of the chosen subdomain. Add an **A** record pointing to the VPS. If using AAAA, ensure IPv6 is correctly routed.
- Inbound TCP ports 80 and 443 open, outbound HTTPS permitted.
- No other service bound to ports 80/443. If one exists, integrate the reverse proxy into it instead of launching a second Caddy.

## Start
1. Copy `.env.example` to `.env`; change `NUMEN_DOMAIN` to the hostname whose DNS points to the VPS. Do not include `https://`.
2. `docker compose up -d --build`
3. `docker compose logs -f caddy geometry` (Ctrl+C exits logs only).
4. After TLS issuance, check `https://YOUR_HOST/health`, `/openapi.json`, `/llms.txt` and `/mcp` (POST only).

Caddy obtains and renews TLS certificates automatically when DNS and ports are correctly configured. Data and model cache survive container restarts in Docker volumes. On first boot, indexing may take time; empty results do not necessarily mean failure.

## MCP smoke test (PowerShell)
```powershell
$uri = 'https://YOUR_HOST/mcp'
$headers = @{ Accept = 'application/json, text/event-stream'; 'MCP-Protocol-Version' = '2025-03-26' }
$init = @{jsonrpc='2.0';id=1;method='initialize';params=@{protocolVersion='2025-03-26';capabilities=@{};clientInfo=@{name='numen-smoke';version='1.0'}}} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Headers $headers -Body $init
$list = @{jsonrpc='2.0';id=2;method='tools/list';params=@{}} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Headers $headers -Body $list
```

## Security and operational notes
- This public read-only API can still be abused with expensive requests. **Caddyfile does not implement per-client rate limiting**; configure rate limits and DDoS protections at a trusted CDN/WAF or gateway before broad promotion. Consider concurrency and request budgets for `/mcp`, `/objects`, `/api/v1/compare`, and feature endpoints.
- Keep the origin server behind a firewall; expose only 80/443, not port 8000. If using a CDN, configure real-client-IP trust correctly before rate limiting.
- No authentication is configured; do not describe this as an authenticated AI-only service. No special wallet/token/gas access is required.
- Verify compatibility with the actual ChatGPT/Gemini client: not every MCP client supports this stateless JSON-response implementation. No automatic discovery or connector installation is implied.
- Watch `docker compose logs`, disk growth in the two volumes, CPU and GraphQL rate limits. Back up the `geometry_data` volume. Monitor TLS renewals.
- The project currently relies on experimental Node.js TypeScript type stripping and SQLite; validate Node 22 upgrades in staging.
