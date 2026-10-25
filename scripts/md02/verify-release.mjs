/** Disposable macOS release verification. Never connects to a hosted project.
 * Retains private local evidence, stops only the cluster it created.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const repo=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if(process.platform!=='darwin') throw Error('This guarded runner requires macOS; do not weaken local socket guards for CI.');
const root='/private/tmp/missionos-md02-d-'+randomUUID().slice(0,8);
const evidence=root+'-evidence', pg=process.env.MD02_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
await mkdir(evidence,{mode:0o700});
const env={...process.env,MD02_GATEWAY_CONFIG:root+'/gateway.json',MD02_EVIDENCE_DIR:evidence,MD02_TEST_REPORT:evidence+'/browser.json',MD02_BASE_URL:'http://127.0.0.1:5185',MD02_APP_PORT:'5185',MD02_GATEWAY_PORT:'5186',MD02_PSQL:pg+'/psql'};
const children=[]; const results=[];
async function run(label,cmd,args,extra={}) {
  const log=[];
  const status=await new Promise((yes,no)=>{
    const p=spawn(cmd,args,{cwd:repo,env,...extra});p.on('error',no);
    p.stdout?.on('data',b=>{log.push(b);process.stdout.write(b)});
    p.stderr?.on('data',b=>{log.push(b);process.stderr.write(b)});
    p.on('close',yes);
  });
  await writeFile(evidence+'/'+label+'.log',Buffer.concat(log),{mode:0o600});
  if(status!==0) throw Error(label+' failed: '+status);
  results.push({name:label,status:'pass'});
}
function service(cmd,args){const p=spawn(cmd,args,{cwd:repo,env,stdio:'ignore'});children.push(p);p.on('error',()=>{});return p;}
async function ready(url){for(let i=0;i<100;i++){if(children.some(p=>p.exitCode!==null))throw Error('Local service exited');try{const r=await fetch(url);if(r.status<500)return;}catch{} await new Promise(r=>setTimeout(r,200));}throw Error('Local service startup timed out');}
let passed=false;
try {
  await run('setup','python3',['scripts/md02/setup.py','--root',root,'--observer','--pg-bin',pg,'--app-port','5185','--gateway-port','5186','--pg-port','55435']);
  service(process.execPath,['scripts/md02/server.mjs',root+'/gateway.json']);
  service(process.execPath,['node_modules/vite/bin/vite.js','--mode','md02']);
  await ready(env.MD02_BASE_URL+'/api/md02/session');
  await run('browser',process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.md02.config.ts','--output',evidence+'/browser-artifacts']);
  const browser=JSON.parse(await readFile(evidence+'/browser.json','utf8'));
  if(browser.stats.expected!==24 || browser.stats.unexpected || browser.stats.skipped || browser.stats.flaky)throw Error('Expected 24 browser cases without failures, skips or retries');
  await run('foundation','python3',['supabase/pilots/md02/tests/run.py','--socket',root+'/socket','--port','55435','--report',evidence+'/foundation.json']);
  await run('output','python3',['supabase/pilots/md02c/tests/output.py','--config',root+'/gateway.json','--report',evidence+'/output.json']);
  for(const [name,count] of [['foundation',89],['output',24]]){const r=JSON.parse(await readFile(evidence+'/'+name+'.json','utf8'));if(r.status!=='pass'||r.count!==count)throw Error(name+' evidence count mismatch');}
  await run('http',process.execPath,['scripts/md02/http-tests.mjs',root+'/gateway.json']);
  if(!(await readFile(evidence+'/http.log','utf8')).includes('MD02_HTTP_COMPLETE 11'))throw Error('HTTP evidence count mismatch');
  passed=true;
} finally {
  for(const p of children)p.kill('SIGTERM');
  await Promise.all(children.map(p=>p.exitCode!==null?null:new Promise(r=>p.once('close',r))));
  const stopped=spawnSync(pg+'/pg_ctl',['-D',root+'/pgdata','stop','-m','fast'],{encoding:'utf8'});
  const stoppedOK=stopped.status===0;
  await writeFile(evidence+'/release-verification.json',JSON.stringify({status:passed&&stoppedOK?'pass':'fail',checked_at:new Date().toISOString(),results,counts:{browser:24,foundation:89,output:24,http:11},cluster_stopped:stoppedOK,scope:'Fresh local fictional PostgreSQL + browser + HTTP only',limitations:['Supabase Auth/JWT/PostgREST not exercised','Owner MD02 C and physical iPhone review pending','No production deployment, PHI readiness or institutional records authority established']},null,2)+'\n',{mode:0o600});
  await chmod(evidence,0o700);
  console.log('PRIVATE_LOCAL_EVIDENCE',evidence);
  if(!stoppedOK)throw Error('Owned disposable cluster did not stop; inspect '+root);
}
