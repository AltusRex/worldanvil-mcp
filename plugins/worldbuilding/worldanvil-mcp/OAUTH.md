# Terminus OAuth (experimental)

Single-owner deployment only. Do not enable on production until CI and interoperability checks pass.

## Configuration
Set these in the hosting environment, not source control:
- MCP_OAUTH_ISSUER: canonical HTTPS origin, no trailing slash.
- MCP_OAUTH_OWNER_SECRET: independently generated high-entropy secret (at least 32 characters).
- MCP_OAUTH_REDIRECT_URIS: comma-separated exact HTTPS callback URLs verified against the intended client.
- MCP_OAUTH_STATE_PATH: optional absolute path in an existing private writable persistent directory; single process only.
- WA_AUTH_TOKEN and WA_APP_KEY: existing server-side World Anvil configuration.
- MCP_ACCESS_TOKEN: optional legacy bearer credential; remove when no longer needed.

OAuth is disabled unless all three OAuth settings are present and valid. Health checks remain independent. The owner enters the approval secret only on the verified Terminus HTTPS authorization page.

## Current limitations
Client identity is derived from the issuer, owner secret and canonical configured redirect set; it survives restarts with unchanged configuration. Registration requires the exact configured redirect set. Without a state path, tokens and codes are process-local. With a state path, hashed tokens, codes and replay markers are committed together using authenticated snapshots, atomic rename and fsync. Pending approvals remain ephemeral. Storage errors disable OAuth until restart; invalid snapshots prevent startup. Access tokens expire after one hour and refresh families after 24 hours. Refresh replay revokes the family transactionally, including across restarts with persistent storage. The global approval throttle can cause temporary denial of service. Public registration does not allocate client records; pending approvals and token maps have bounded capacity but remain susceptible to exhaustion. Do not claim durable sessions or production-grade abuse resistance.

## Acceptance gates
- Run npm ci and npm test in this directory and build the Docker image.
- Confirm discovery, exact redirect validation, owner approval, PKCE, code replay rejection, refresh rotation and family revocation.
- Confirm the actual ChatGPT callback and client authentication method are supported; do not relax the redirect allowlist.
- Confirm authenticated MCP initialization and tool listing, then a read-only World Anvil call.
- Confirm restart behavior and decide whether reauthorization is acceptable or durable transactional storage is required.
- Review security and deployment configuration before merging; the existing Render branch auto-deploys.

No additional hosting resources are required for the experimental in-memory mode. File persistence requires a genuinely persistent filesystem; Render free ephemeral storage does not survive redeploys. No disk is provisioned by this change. Never run multiple processes against the same file. Backups or filesystem rollback can resurrect revoked tokens; do not restore old snapshots. Rotate the owner secret and discard the old state file to invalidate all sessions.

## Secure deployment preflight
Enter credentials only in the hosting provider's protected environment settings, never in chat, source control, command arguments or build logs. Run `node preflight.js` inside the configured runtime. It emits only fixed check names, booleans and status labels, exits 1 on incomplete configuration, and makes no network calls or writes. A passing check verifies local configuration only, not World Anvil credential validity, filesystem writability/durability or live ChatGPT interoperability. No public readiness endpoint exposes credential presence. Use independently generated secrets and leave the legacy bearer unset unless needed. The public health endpoint remains credential-independent.
