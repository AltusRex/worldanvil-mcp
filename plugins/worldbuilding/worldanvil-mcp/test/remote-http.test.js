import { afterEach, describe, expect, it } from "vitest";
import { createRemoteServer } from "../http.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const token = "x".repeat(40);
let server;
async function start(credentials = { token, authToken: "mock" }) {
  server = createRemoteServer({ ...credentials, serverFactory: () => {
    const server = new Server({ name: "test", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
    return { server };
  } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + server.address().port;
}
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined; }
});
describe("remote MCP", () => {
  it("recognizes root and normalized health paths without credentials", async () => {
    const url = await start({});
    const root = await fetch(url + "/");
    expect(root.status).toBe(200);
    expect((await root.json()).service).toBe("terminus-worldanvil-mcp");
    for (const path of ["/healthz", "/healthz/", "/healthz?probe=1", "/healthz/?probe=1"]) {
      const response = await fetch(url + path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("ok");
    }
    expect((await fetch(url + "/healthz", { method: "HEAD" })).status).toBe(200);
    expect((await fetch(url + "/mcp/?probe=1")).status).toBe(503);
    expect((await fetch(url + "/unknown")).status).toBe(404);
  });
  it.each([{}, { token }, { authToken: "mock" }, { token: "short", authToken: "mock" }])("starts but fails closed with incomplete credentials: %j", async (credentials) => {
    const url = await start(credentials);
    const health = await fetch(url + "/healthz");
    expect(health.status).toBe(200);
    expect(await health.text()).toBe("ok");
    const response = await fetch(url + "/mcp", { method: "POST", headers: { authorization: "Bearer " + token } });
    expect(response.status).toBe(503);
  });
  it("rejects missing and incorrect bearer tokens", async () => {
    const url = await start();
    expect((await fetch(url + "/mcp", { method: "POST" })).status).toBe(401);
    expect((await fetch(url + "/mcp", { method: "POST", headers: { authorization: "Bearer wrong" } })).status).toBe(401);
  });
  it("initializes over authenticated HTTP", async () => {
    const url = await start();
    const response = await fetch(url + "/mcp", { method: "POST", headers: {
      authorization: "Bearer " + token, "content-type": "application/json", accept: "application/json, text/event-stream"
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" }
    } }) });
    expect(response.status).toBe(200);
    expect((await response.json()).result.serverInfo.name).toBe("test");
  });
});

describe("owner OAuth", () => {
  it("discovers, registers, authorizes with PKCE, rejects replay and rotates refresh", async () => {
    const issuer="https://example.test", redirect="https://client.example/callback", secret="s".repeat(48);
    const url=await start({authToken:"mock",oauthOptions:{issuer,ownerSecret:secret,redirectUris:[redirect]}});
    const {createHash}=await import("node:crypto");
    const verifier="v".repeat(64), challenge=createHash("sha256").update(verifier).digest("base64url");
    const post=(path,data,type="application/x-www-form-urlencoded")=>fetch(url+path,{method:"POST",headers:{"content-type":type},body:type==="application/json"?JSON.stringify(data):new URLSearchParams(data),redirect:"manual"});
    expect((await fetch(url+"/healthz")).status).toBe(200);
    const unauthorized=await fetch(url+"/mcp");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("resource_metadata");
    expect((await (await fetch(url+"/.well-known/oauth-protected-resource/mcp")).json()).resource).toBe(issuer+"/mcp");
    expect((await post("/oauth/register",{redirect_uris:["https://evil.example"]},"application/json")).status).toBe(400);
    const registration=await post("/oauth/register",{redirect_uris:[redirect],token_endpoint_auth_method:"none"},"application/json");
    expect(registration.status).toBe(201);
    const {client_id}=await registration.json();
    const params=new URLSearchParams({client_id,redirect_uri:redirect,response_type:"code",code_challenge:challenge,code_challenge_method:"S256",state:"state",resource:issuer+"/mcp"});
    const begin=async()=> (await (await fetch(url+"/oauth/authorize?"+params)).text()).match(/name="request" value="([^"]+)"/)[1];
    expect((await post("/oauth/authorize",{request:await begin(),secret:"wrong"})).status).toBe(403);
    const approval=await post("/oauth/authorize",{request:await begin(),secret});
    expect(approval.status).toBe(303);
    const callback=new URL(approval.headers.get("location"));
    expect(callback.searchParams.get("state")).toBe("state");
    const exchange={grant_type:"authorization_code",client_id,redirect_uri:redirect,code:callback.searchParams.get("code"),code_verifier:verifier};
    expect((await post("/oauth/token",{...exchange,code_verifier:"w".repeat(64)})).status).toBe(400);
    const response=await post("/oauth/token",exchange);
    expect(response.status).toBe(200);
    const tokens=await response.json();
    expect((await post("/oauth/token",exchange)).status).toBe(400);
    expect((await fetch(url+"/mcp",{headers:{authorization:"Bearer "+tokens.access_token}})).status).toBe(405);
    const refresh={grant_type:"refresh_token",client_id,refresh_token:tokens.refresh_token};
    const rotated=await post("/oauth/token",refresh);
    expect(rotated.status).toBe(200);
    const next=await rotated.json();
    expect((await post("/oauth/token",refresh)).status).toBe(400);
    expect((await fetch(url+"/mcp",{headers:{authorization:"Bearer "+next.access_token}})).status).toBe(401);
    expect((await post("/oauth/token",{...refresh,refresh_token:next.refresh_token})).status).toBe(400);
  });
});
