import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const random = () => randomBytes(32).toString("base64url");
const hash = s => createHash("sha256").update(s).digest("base64url");
const equal = (a,b) => typeof a === "string" && typeof b === "string" && timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const escape = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const json = (res,status,data) => { res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","Pragma":"no-cache"}); res.end(JSON.stringify(data)); };
async function body(req,type) {
  if ((req.headers["content-type"] || "").split(";")[0].trim() !== type) throw Error("content type");
  let size=0; const chunks=[];
  for await(const chunk of req) { size+=chunk.length; if(size>16384) throw Error("size"); chunks.push(chunk); }
  const raw=Buffer.concat(chunks).toString("utf8");
  if(type==="application/json") return JSON.parse(raw);
  const params=new URLSearchParams(raw);
  if(new Set(params.keys()).size!==[...params.keys()].length) throw Error("duplicate");
  return Object.fromEntries(params);
}
export function createOAuth({issuer,ownerSecret,redirectUris=[]}={}) {
  if(!issuer || typeof ownerSecret!=="string" || ownerSecret.length<32 || !redirectUris.length) return null;
  const origin=new URL(issuer);
  if(origin.protocol!=="https:" || origin.origin!==issuer) throw Error("OAuth issuer must be an HTTPS origin");
  for(const uri of redirectUris) { const u=new URL(uri); if(u.protocol!=="https:" || u.hash || u.username || u.password) throw Error("Invalid OAuth redirect URI"); }
  const resource=issuer+"/mcp", metadata=issuer+"/.well-known/oauth-protected-resource/mcp";
  const clients=new Map(), pending=new Map(), codes=new Map(), access=new Map(), refresh=new Map();
  const put=(map,key,value,ttl)=>{ for(const [k,v] of map) if(v.exp<=Date.now()) map.delete(k); if(map.size>=1000) throw Error("capacity"); map.set(key,{...value,exp:Date.now()+ttl}); };
  const get=(map,key)=>{const v=map.get(key);return v && v.exp>Date.now()?v:null;};
  const scope="mcp";
  const issue=(res,client)=>{const a=random(),r=random();put(access,hash(a),{client},3600000);put(refresh,hash(r),{client},86400000);json(res,200,{access_token:a,token_type:"Bearer",expires_in:3600,refresh_token:r,scope});};
  return {
    challenge:'Bearer resource_metadata="'+metadata+'"',
    authorized(header){return typeof header==="string" && /^Bearer [A-Za-z0-9_-]{43}$/.test(header) && Boolean(get(access,hash(header.slice(7))));},
    async handle(req,res,path){
      const fail=(error="invalid_request",status=400)=>json(res,status,{error});
      const routes=["/.well-known/oauth-protected-resource","/.well-known/oauth-protected-resource/mcp","/.well-known/oauth-authorization-server","/oauth/register","/oauth/authorize","/oauth/token"];
      if(!routes.includes(path)) return false;
      try {
        if(req.method==="GET" && path.startsWith("/.well-known/")){
          if(path.includes("protected-resource")) json(res,200,{resource,authorization_servers:[issuer],scopes_supported:[scope],bearer_methods_supported:["header"]});
          else json(res,200,{issuer,authorization_endpoint:issuer+"/oauth/authorize",token_endpoint:issuer+"/oauth/token",registration_endpoint:issuer+"/oauth/register",response_types_supported:["code"],grant_types_supported:["authorization_code","refresh_token"],code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"],scopes_supported:[scope]});
        } else if(path==="/oauth/register" && req.method==="POST"){
          const b=await body(req,"application/json");
          if(!Array.isArray(b.redirect_uris)||!b.redirect_uris.length||!b.redirect_uris.every(u=>redirectUris.includes(u))||(b.token_endpoint_auth_method && b.token_endpoint_auth_method!=="none")) {fail("invalid_client_metadata");return true;}
          const id=random();put(clients,id,{uris:b.redirect_uris},7*86400000);
          json(res,201,{client_id:id,redirect_uris:b.redirect_uris,token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]});
        } else if(path==="/oauth/authorize" && req.method==="GET"){
          const q=new URL(req.url,issuer).searchParams;
          const b=Object.fromEntries(q), c=get(clients,b.client_id);
          if(new Set(q.keys()).size!==[...q.keys()].length || !c || !c.uris.includes(b.redirect_uri)||b.response_type!=="code"||b.code_challenge_method!=="S256"||!/^[A-Za-z0-9_-]{43}$/.test(b.code_challenge||"")||(b.resource && b.resource!==resource)||(b.scope && b.scope!==scope)){fail();return true;}
          const id=random();put(pending,id,b,300000);
          res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; form-action 'self'; frame-ancestors 'none'","Referrer-Policy":"no-referrer"});
          res.end('<!doctype html><title>Authorize Terminus</title><h1>Authorize access to your World Anvil account</h1><p>Only the instance owner should approve this request.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="'+escape(id)+'"><label>Owner authorization secret <input type="password" name="secret" required autocomplete="off"></label><button>Authorize</button></form>');
        } else if(path==="/oauth/authorize" && req.method==="POST"){
          const b=await body(req,"application/x-www-form-urlencoded"), p=get(pending,b.request);
          pending.delete(b.request);
          if(!p||!equal(b.secret,ownerSecret)){fail("access_denied",403);return true;}
          const code=random();put(codes,hash(code),p,60000);
          const dest=new URL(p.redirect_uri);dest.searchParams.set("code",code);if(p.state!==undefined)dest.searchParams.set("state",p.state);
          res.writeHead(303,{Location:dest.href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});res.end();
        } else if(path==="/oauth/token" && req.method==="POST"){
          const b=await body(req,"application/x-www-form-urlencoded");
          if(!get(clients,b.client_id)){fail("invalid_client",401);return true;}
          if(b.resource && b.resource!==resource){fail("invalid_target");return true;}
          if(b.grant_type==="authorization_code"){
            const k=hash(b.code||""),p=get(codes,k);
            if(!p||p.client_id!==b.client_id||p.redirect_uri!==b.redirect_uri||!/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier||"")||!equal(hash(b.code_verifier),p.code_challenge)){fail("invalid_grant");return true;}
            codes.delete(k);issue(res,b.client_id);
          } else if(b.grant_type==="refresh_token"){
            const k=hash(b.refresh_token||""),p=get(refresh,k);
            if(!p||p.client!==b.client_id||(b.scope && b.scope!==scope)){fail("invalid_grant");return true;}
            refresh.delete(k);issue(res,b.client_id);
          } else fail("unsupported_grant_type");
        } else fail("invalid_request",405);
      } catch {if(!res.headersSent)fail();else res.end();}
      return true;
    }
  };
}
