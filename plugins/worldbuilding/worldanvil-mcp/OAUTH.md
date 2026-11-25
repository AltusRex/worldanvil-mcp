# Terminus OAuth (experimental)

Single-owner deployment only. Do not enable on production until CI and interoperability checks pass.

## Configuration
Set these in the hosting environment, not source control:
- MCP_OAUTH_ISSUER: canonical HTTPS origin, no trailing slash.
- MCP_OAUTH_OWNER_SECRET: independently generated high-entropy secret (at least 32 characters).
- MCP_OAUTH_REDIRECT_URIS: comma-separated exact HTTPS callback URLs verified against the intended client.
- WA_AUTH_TOKEN and WA_APP_KEY: existing server-side World Anvil configuration.
- MCP_ACCESS_TOKEN: optional legacy bearer credential; remove when no longer needed.

OAuth is disabled unless all three OAuth settings are present and valid. Health checks remain independent. The owner enters the approval secret only on the verified Terminus HTTPS authorization page.

## Current limitations
Client identity is derived from the issuer, owner secret and canonical configured redirect set; it survives restarts with unchanged configuration. Registration requires the exact configured redirect set. Access tokens, refresh tokens, pending approvals and codes are process-local and lost on restart. Access tokens expire after one hour and refresh families after 24 hours. Refresh replay revokes the family within the running process. The global approval throttle can cause temporary denial of service. Public registration does not allocate client records; pending approvals and token maps have bounded capacity but remain susceptible to exhaustion. Do not claim durable sessions or production-grade abuse resistance.

## Acceptance gates
- Run npm ci and npm test in this directory and build the Docker image.
- Confirm discovery, exact redirect validation, owner approval, PKCE, code replay rejection, refresh rotation and family revocation.
- Confirm the actual ChatGPT callback and client authentication method are supported; do not relax the redirect allowlist.
- Confirm authenticated MCP initialization and tool listing, then a read-only World Anvil call.
- Confirm restart behavior and decide whether reauthorization is acceptable or durable transactional storage is required.
- Review security and deployment configuration before merging; the existing Render branch auto-deploys.

No additional hosting resources are required for the experimental in-memory mode. Durable storage is not implemented.
