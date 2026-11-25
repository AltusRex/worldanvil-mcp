import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { createOAuth } from "./oauth.js";

export function preflight(env=process.env) {
  const checks={};
  const present=v=>typeof v==="string" && v.length>0 && v.trim()===v && !/[\s\x00-\x1f\x7f]/.test(v);
  const secret=v=>present(v)&&v.length>=32;
  checks.worldAnvilToken=present(env.WA_AUTH_TOKEN);
  checks.worldAnvilAppKey=present(env.WA_APP_KEY);
  const redirectUris=(env.MCP_OAUTH_REDIRECT_URIS||"").split(",").map(s=>s.trim()).filter(Boolean);
  const options={issuer:env.MCP_OAUTH_ISSUER,ownerSecret:env.MCP_OAUTH_OWNER_SECRET,redirectUris,statePath:env.MCP_OAUTH_STATE_PATH};
  checks.oauth=false;
  try { checks.oauth=secret(options.ownerSecret)&&Boolean(createOAuth(options)); } catch {}
  checks.legacyBearer=env.MCP_ACCESS_TOKEN ? secret(env.MCP_ACCESS_TOKEN)&&env.MCP_ACCESS_TOKEN!==options.ownerSecret : null;
  checks.separateCredentials=(!options.ownerSecret||![env.WA_AUTH_TOKEN,env.WA_APP_KEY].includes(options.ownerSecret))&&(!env.MCP_ACCESS_TOKEN||![env.WA_AUTH_TOKEN,env.WA_APP_KEY].includes(env.MCP_ACCESS_TOKEN));
  checks.persistence=options.statePath ? (isAbsolute(options.statePath) ? "configured_not_verified" : "invalid") : "ephemeral";
  const ready=checks.worldAnvilToken&&checks.worldAnvilAppKey&&checks.oauth&&checks.separateCredentials&&checks.legacyBearer!==false&&checks.persistence!=="invalid";
  return {ready,checks,worldAnvilConnectivity:"not_tested",filesystemDurability:"not_verified"};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=preflight();
  console.log(JSON.stringify(result));
  process.exitCode=result.ready?0:1;
}
