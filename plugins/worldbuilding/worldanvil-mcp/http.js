import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./src/server.js";
import { createOAuth } from "./oauth.js";

export function createRemoteServer({ token, authToken, appKey, toolGroups, oauthOptions, serverFactory = createServer } = {}) {
  const oauth = createOAuth(oauthOptions);
  const configured = typeof token === "string" && token.length >= 32 && Boolean(authToken);
  const expected = configured ? Buffer.from("Bearer " + token) : null;
  const authorized = (value) => {
    const actual = Buffer.from(value || "");
    return expected !== null && actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  return createHttpServer(async (req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: message }));
    };
    let path;
    try { path = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "") || "/"; }
    catch { return reply(400, "Invalid request"); }
    const route = ["/", "/healthz", "/mcp"].includes(path) ? path : "unknown";
    const method = ["GET", "HEAD", "POST", "DELETE", "OPTIONS"].includes(req.method) ? req.method : "OTHER";
    res.once("finish", () => console.error(JSON.stringify({ method, route, status: res.statusCode })));
    if (path === "/" && ["GET", "HEAD"].includes(req.method)) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ service: "terminus-worldanvil-mcp", health: "/healthz" })); return;
    }
    if (path === "/healthz" && ["GET", "HEAD"].includes(req.method)) {
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); res.end("ok"); return;
    }
    if (oauth && await oauth.handle(req, res, path)) return;
    if (path !== "/mcp") return reply(404, "Not found");
    if (!authToken || (!configured && !oauth)) return reply(503, "MCP unavailable");
    if (!authorized(req.headers.authorization) && !oauth?.authorized(req.headers.authorization)) {
      res.setHeader("WWW-Authenticate", oauth?.challenge || "Bearer");
      return reply(401, "Unauthorized");
    }
    if (req.headers.origin) return reply(403, "Browser origins are not supported");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return reply(405, "Stateless MCP supports POST only");
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) return reply(415, "Expected application/json");
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { reply(413, "Request too large"); return; }
        chunks.push(chunk);
      }
    } catch { if (!res.headersSent) reply(400, "Invalid request"); return; }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return reply(400, "Invalid JSON"); }
    let server, transport;
    try {
      ({ server } = serverFactory({ authToken, appKey, toolGroups }));
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.once("close", () => { void server.close().catch(() => {}); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) reply(500, "MCP request failed");
      else if (!res.writableEnded) res.end();
      if (server) await server.close().catch(() => {});
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRemoteServer({
    token: process.env.MCP_ACCESS_TOKEN,
    oauthOptions: { issuer: process.env.MCP_OAUTH_ISSUER, ownerSecret: process.env.MCP_OAUTH_OWNER_SECRET, redirectUris: (process.env.MCP_OAUTH_REDIRECT_URIS || "").split(",").map(s => s.trim()).filter(Boolean) },
    authToken: process.env.WA_AUTH_TOKEN,
    appKey: process.env.WA_APP_KEY,
    toolGroups: process.env.WA_TOOL_GROUPS,
  });
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0", () => console.error("Remote MCP listening"));
}
