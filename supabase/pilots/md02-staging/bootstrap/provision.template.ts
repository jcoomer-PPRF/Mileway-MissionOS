// One-time staging-only provisioning template. Replace hash/expiry privately;
// disable the deployed function after use. No supplied roles, email or passwords.
import { createClient } from 'npm:@supabase/supabase-js@2.108.2';
const target='https://bgvhqsfpjanmqixtmdtl.supabase.co';
const expected='__BOOTSTRAP_HASH__',expires='__BOOTSTRAP_EXPIRES__';
const labels=['author','reviewer','unassigned','observer','assigner','foreign','inactive'];
const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req)=>{
 try{
  if(Deno.env.get('SUPABASE_URL')!==target||Date.now()>Date.parse(expires)||req.method!=='POST')return reply(404,{code:'UNAVAILABLE'});
  const token=req.headers.get('x-bootstrap-token')||'';if(token.length<40||token.length>200)return reply(403,{code:'DENIED'});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==expected)return reply(403,{code:'DENIED'});
  if((await req.text())!=='{}')return reply(400,{code:'INVALID'});
  const client=createClient(target,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const existing=await client.auth.admin.listUsers({page:1,perPage:1000});if(existing.error)return reply(503,{code:'PROVISION_FAILED'});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);const accounts=[];
  for(const label of labels){
   const email=`md02-staging-${label}@example.invalid`;const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(email)));const password='Aa9!'+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
   let user=existing.data.users.find(u=>u.email===email);
   if(!user){const result=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'TRAINING MD02 '+label}});if(result.error||!result.data.user)return reply(503,{code:'PROVISION_FAILED'});user=result.data.user;}
   accounts.push({username:'training-'+label,email,id:user.id,password,label:'TRAINING '+label});
  }
  return reply(200,{accounts,scope:'fictional staging only'});
 }catch{return reply(503,{code:'PROVISION_FAILED'});}
});
