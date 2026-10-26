/** Fictional staging only. Validates real Auth; uses only caller-scoped RPC. */
import {createClient} from 'npm:@supabase/supabase-js@2.108.2';
const target='https://bgvhqsfpjanmqixtmdtl.supabase.co';
const known=new Set(['AUTH_REQUIRED','NOT_FOUND_OR_NOT_ALLOWED','VERSION_CONFLICT','INVALID_STATE','VALIDATION_FAILED','REQUEST_ID_REUSED']);
const send=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
Deno.serve(async(req)=>{
 try{
  if(Deno.env.get('SUPABASE_URL')!==target)return send(503,{code:'STAGING_TARGET_REQUIRED'});
  if(req.method!=='POST'||req.headers.get('content-type')!=='application/json')return send(400,{code:'VALIDATION_FAILED'});
  const authorization=req.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(authorization))return send(401,{code:'AUTH_REQUIRED'});
  const token=authorization.slice(7),client=createClient(target,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const identity=await client.auth.getUser(token);
  if(identity.error||!identity.data.user){const status=identity.error?.status;if(status===429)return send(429,{code:'RATE_LIMITED'});return send(status&&status>=400&&status<500?401:503,{code:status&&status>=400&&status<500?'AUTH_REQUIRED':'TRANSIENT_FAILURE'});}
  const text=await req.text();if(text.length>524288)return send(400,{code:'VALIDATION_FAILED'});
  let body;try{body=JSON.parse(text);}catch{return send(400,{code:'VALIDATION_FAILED'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==3||!['list','read','command','output'].includes(body.action)||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(body.scope)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload)||Object.keys(body).some(k=>!['action','scope','payload'].includes(k)))return send(400,{code:'VALIDATION_FAILED'});
  const result=await client.rpc('md02_staging_api',{p_action:body.action,p_scope:body.scope,p_payload:body.payload});
  if(result.error){const message=result.error.message;const code=known.has(message)?message:result.error.code?.startsWith('22')?'VALIDATION_FAILED':'TRANSIENT_FAILURE';return send(['AUTH_REQUIRED','NOT_FOUND_OR_NOT_ALLOWED'].includes(code)?401:['VERSION_CONFLICT','INVALID_STATE','REQUEST_ID_REUSED'].includes(code)?409:code==='TRANSIENT_FAILURE'?503:400,{code});}
  return send(200,result.data);
 }catch{return send(503,{code:'TRANSIENT_FAILURE'});}
});
