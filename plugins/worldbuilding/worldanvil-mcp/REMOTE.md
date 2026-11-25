# Remote MCP (experimental)

The existing stdio entry point is unchanged. This branch adds a stateless Streamable HTTP endpoint using the same server factory and handlers, including raw CSS and BBCode support.

## Local test

Use Node 22, run npm ci and npm test in this directory. Set WA_AUTH_TOKEN and a separate random MCP_ACCESS_TOKEN (at least 32 characters). Optionally set WA_APP_KEY for direct API mode; otherwise the existing proxy is used. Run node http.js. The endpoint is http://localhost:8080/mcp; GET /healthz is unauthenticated and exposes no data. It returns 200 even when credentials are missing or invalid in length; it measures process liveness only, not World Anvil connectivity. Until both required credentials are configured, /mcp returns 503 and never constructs the World Anvil client. Use /healthz to wake a sleeping Render free service before attempting MCP requests. Send Authorization: Bearer <MCP_ACCESS_TOKEN> and Accept: application/json, text/event-stream on MCP POST requests. Do not expose plain HTTP publicly.

## Cloud Run

Build from this directory using the Dockerfile. Deploy the image to Cloud Run with port 8080, minimum instances 0, and a small maximum instance count (e.g. 1). Store both tokens in Secret Manager and inject them as environment variables. The platform HTTPS endpoint must allow requests to reach the application bearer-token check. Never disable that check. Set billing alerts; free tier is not a guarantee of zero charges.

## Client compatibility

This is a bearer-authenticated endpoint, not an OAuth authorization server. Verify that the intended MCP client supports supplying a static Authorization header. If ChatGPT requires OAuth, implement a standards-compliant OAuth resource-server integration before connecting it; do not select unauthenticated mode or put secrets in URLs. GET/DELETE on /mcp return 405 because the transport is stateless. Test read-only calls first. Existing tools include write and delete operations; review exposure before enabling a client.

No credentials belong in source control. Rotate tokens if exposed.
