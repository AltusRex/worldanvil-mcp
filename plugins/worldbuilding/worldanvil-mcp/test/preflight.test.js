import { describe,it,expect } from "vitest";
import { preflight } from "../preflight.js";
const valid={WA_AUTH_TOKEN:"test-token",WA_APP_KEY:"test-app-key",MCP_OAUTH_ISSUER:"https://example.test",MCP_OAUTH_OWNER_SECRET:"s".repeat(48),MCP_OAUTH_REDIRECT_URIS:"https://client.example/callback"};
describe("deployment preflight",()=>{
 it("reports readiness without exposing values or claiming connectivity",()=>{
   const result=preflight(valid);
   expect(result.ready).toBe(true);
   expect(result.worldAnvilConnectivity).toBe("not_tested");
   expect(result.filesystemDurability).toBe("not_verified");
   for(const value of Object.values(valid))expect(JSON.stringify(result)).not.toContain(value);
 });
 it.each([{WA_AUTH_TOKEN:""},{WA_APP_KEY:""},{MCP_OAUTH_OWNER_SECRET:"short"},{MCP_OAUTH_ISSUER:"http://example.test"},{MCP_OAUTH_REDIRECT_URIS:"http://client.example"},{MCP_ACCESS_TOKEN:"short"},{MCP_ACCESS_TOKEN:valid.MCP_OAUTH_OWNER_SECRET},{WA_AUTH_TOKEN:valid.MCP_OAUTH_OWNER_SECRET},{MCP_OAUTH_STATE_PATH:"relative.json"}])("rejects incomplete or unsafe configuration",override=>{
   expect(preflight({...valid,...override}).ready).toBe(false);
 });
 it("distinguishes ephemeral storage from configured but unverified persistence",()=>{
   expect(preflight(valid).checks.persistence).toBe("ephemeral");
   expect(preflight({...valid,MCP_OAUTH_STATE_PATH:"/tmp/terminus-preflight-test-nonexistent/state.json"}).checks.persistence).toBe("configured_not_verified");
 });
});
