/** ISOLATED STAGING BFF. Real Auth tokens stay only in server memory. */
import http from 'node:http';import {readFile,stat} from 'node:fs/promises';import {dirname,resolve} from 'node:path';import {randomBytes} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
const path=resolve(process.argv[2]||''),cfg=JSON.parse(await readFile(path,'utf8')),target='https://bgvhqsfpjanmqixtmdtl.supabase.co';
for(const p of [path,dirname(path)]){const s=await stat(p);if(s.uid!==process.getuid()||(s.mode&0o777)!==(p===path?0o600:0o700))throw Error('PRIVATE_CONFIG_REQUIRED');}
if(cfg.url!==target||cfg.project!=='bgvhqsfpjanmqixtmdtl'||cfg.scope!=='90000000-0000-0000-0000-000000000001'||cfg.httpPort!==5216||cfg.origin!=='http://127.0.0.1:5215'||!cfg.key||cfg.accounts.some(a=>!a.email.endsWith('@example.invalid')))throw Error('STAGING_TARGET_REQUIRED');
const S=cfg.scope,cookieName='md02_staging_session';const sessions=new Map(),attempts=new Map();
const cookie=t=>`${cookieName}=${t}; HttpOnly; SameSite=Strict; Path=/api/md02; Max-Age=${t?1200:0}`;
const send=(res,status,data,c)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...(c?{'Set-Cookie':c}:{})});res.end(JSON.stringify(data));};
const apiError=(code,status)=>Object.assign(Error(code),{status});
async function api(s,action,payload){let res;try{res=await fetch(target+'/functions/v1/md02-api',{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+s.accessToken,'Content-Type':'application/json'},body:JSON.stringify({action,scope:S,payload}),signal:AbortSignal.timeout(15000)});}catch{throw apiError('TRANSIENT_FAILURE',503);}let data;try{data=await res.json();}catch{throw apiError('TRANSIENT_FAILURE',503);}if(!res.ok){const known=['AUTH_REQUIRED','NOT_FOUND_OR_NOT_ALLOWED','VERSION_CONFLICT','INVALID_STATE','VALIDATION_FAILED','REQUEST_ID_REUSED','RATE_LIMITED'];throw apiError(known.includes(data.code)?data.code:'TRANSIENT_FAILURE',res.status>=500?503:res.status);}return data;}
function current(req){const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);const s=token&&sessions.get(token);return s&&s.expires>Date.now()?{...s,token}:null;}
async function revoke(s){if(!s)return;sessions.delete(s.token);await s.client.auth.signOut({scope:'local'}).catch(()=>{});}
async function body(req){if(req.headers['content-type']!=='application/json')throw apiError('VALIDATION_FAILED',400);let size=0,b=[];for await(const x of req){size+=x.length;if(size>524288)throw apiError('VALIDATION_FAILED',400);b.push(x);}let v;try{v=JSON.parse(Buffer.concat(b).toString());}catch{throw apiError('VALIDATION_FAILED',400);}if(!v||typeof v!=='object'||Array.isArray(v))throw apiError('VALIDATION_FAILED',400);return v;}
const exact=(v,keys)=>Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const server=http.createServer(async(req,res)=>{let s;
 try{
  if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||![new URL(cfg.origin).host,'127.0.0.1:5216'].includes(req.headers.host))throw apiError('NOT_FOUND_OR_NOT_ALLOWED',401);
  if(req.method==='GET'&&req.url==='/api/md02/session'){s=current(req);if(!s)return send(res,200,{user:null});await api(s,'list',{});return send(res,200,{user:s.user,csrf:s.csrf,expires:s.expires});}
  if(req.method!=='POST'||req.headers.origin!==cfg.origin)throw apiError('NOT_FOUND_OR_NOT_ALLOWED',401);
  const b=await body(req);
  if(req.url==='/api/md02/login'){
   if(!exact(b,['username','password'])||typeof b.username!=='string'||typeof b.password!=='string'||b.password.length>200)throw apiError('VALIDATION_FAILED',400);
   const account=cfg.accounts.find(a=>a.username===b.username),bucket=account?account.username:'unknown',old=attempts.get(bucket),limit=old&&old.until>Date.now()?old:{count:0,until:Date.now()+60000};limit.count++;attempts.set(bucket,limit);if(limit.count>20)throw apiError('RATE_LIMITED',429);
   const client=createClient(target,cfg.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});let result;try{result=await client.auth.signInWithPassword({email:account?.email||'md02-staging-denied@example.invalid',password:b.password});}catch{throw apiError('TRANSIENT_FAILURE',503);}
   if(result.error){const status=result.error.status;if(status===429)throw apiError('RATE_LIMITED',429);throw apiError(status&&status>=400&&status<500?'AUTH_REQUIRED':'TRANSIENT_FAILURE',status&&status>=400&&status<500?401:503);}
   if(!account||result.data.user?.id!==account.id||!result.data.session)throw apiError('AUTH_REQUIRED',401);
   const token=randomBytes(32).toString('base64url');s={client,accessToken:result.data.session.access_token,user:{id:account.id,label:account.label,username:account.username},csrf:randomBytes(32).toString('base64url'),expires:Math.min(Date.now()+1200000,result.data.session.expires_at*1000-1000),token};
   await api(s,'list',{});await revoke(current(req));sessions.set(token,s);return send(res,200,{user:s.user,csrf:s.csrf,expires:s.expires},cookie(token));
  }
  s=current(req);if(!s)throw apiError('AUTH_REQUIRED',401);if(req.headers['x-md02-csrf']!==s.csrf)throw apiError('NOT_FOUND_OR_NOT_ALLOWED',401);
  if(req.url==='/api/md02/logout'){if(!exact(b,[]))throw apiError('VALIDATION_FAILED',400);await revoke(s);return send(res,200,{ok:true},cookie(''));}
  const action={'/api/md02/encounters':'list','/api/md02/note':'read','/api/md02/command':'command','/api/md02/output':'output'}[req.url];if(!action)throw apiError('NOT_FOUND_OR_NOT_ALLOWED',401);return send(res,200,await api(s,action,b));
 }catch(e){const known=['AUTH_REQUIRED','NOT_FOUND_OR_NOT_ALLOWED','VERSION_CONFLICT','INVALID_STATE','VALIDATION_FAILED','REQUEST_ID_REUSED','RATE_LIMITED','TRANSIENT_FAILURE'];const code=known.includes(e.message)?e.message:'TRANSIENT_FAILURE';const auth=['AUTH_REQUIRED','NOT_FOUND_OR_NOT_ALLOWED'].includes(code);if(auth&&s)await revoke(s);send(res,e.status||503,{code},auth?cookie(''):undefined);}
});
server.requestTimeout=20000;server.headersTimeout=10000;server.listen(cfg.httpPort,'127.0.0.1',()=>console.log('Fictional staging BFF listening on loopback; no request bodies or tokens logged.'));
const cleanup=setInterval(()=>{for(const [token,s] of sessions)if(s.expires<=Date.now())void revoke({...s,token});},60000);cleanup.unref();process.on('SIGTERM',()=>{server.closeAllConnections();server.close();clearInterval(cleanup);});
