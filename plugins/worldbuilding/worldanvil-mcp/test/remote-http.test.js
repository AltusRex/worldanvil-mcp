import { afterEach, describe, expect, it } from "vitest";
import { createRemoteServer } from "../http.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const token = "x".repeat(40);
let server;
async function start() {
  server = createRemoteServer({ token, authToken: "mock", serverFactory: () => {
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
  it("fails closed without credentials", () => expect(() => createRemoteServer()).toThrow());
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
