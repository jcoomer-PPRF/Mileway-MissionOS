#!/usr/bin/env python3
"""Check C output permissions and restore on a completed disposable browser fixture."""
import argparse,json,os,subprocess,uuid,time,hashlib,gzip
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--report',required=True);a=p.parse_args()
config=Path(a.config).resolve()
if not str(config).startswith('/private/tmp/missionos-md02-') or config.name!='gateway.json':raise SystemExit('LOCAL_CONFIG_REQUIRED')
c=json.loads(config.read_text());assert c['socket']==str(config.parent/'socket') and c['database'].startswith('missionos_md02_')
env={k:v for k,v in os.environ.items() if not k.startswith('PG')};base=[c['psql'],'-X','-qAt','-v','ON_ERROR_STOP=1','-h',c['socket'],'-p',str(c['port']),'-U',os.environ['USER']];db=c['database'];checks=[]
def run(sql,database=db,ok=True):
 r=subprocess.run(base+['-d',database],input=sql,text=True,capture_output=True,env=env)
 if ok and r.returncode:raise AssertionError(r.stderr[-1200:])
 return r
assert run("select inet_server_addr() is null and current_setting('missionos.md02_disposable',true)='fictional-training-only'").stdout.strip()=='t'
def quote(s):return "'"+str(s).replace("'","''")+"'"
def uid(i):return f'00000000-0000-0000-0000-{i:012d}'
S='10000000-0000-0000-0000-000000000001';note=run("select id from md02.note where parent_id is null and state='reviewed' limit 1").stdout.strip();assert note
revision=run('select latest_revision from md02.note where id='+quote(note)).stdout.strip()
def actor(i,s):return 'begin;set local role authenticated;set local request.jwt.claim.sub='+quote(uid(i) if i else '')+';'+s+';commit;'
def call(i,s):return json.loads(run(actor(i,s)).stdout)
def out(mode='preview',scope=S,num=revision):return 'select md02.revision_output('+','.join(map(quote,[scope,note,num,mode]))+')'
def passed(s):checks.append(s);print('PASS:',s,flush=True)
def denied(i,s,error,label):
 r=run(actor(i,s),ok=False);assert r.returncode and error in r.stderr,(label,r.stderr);passed(label)
for i,label in [(1,'fleet owner'),(103,'assignment administrator'),(108,'unassigned')]:denied(i,out(),'NOT_FOUND_OR_NOT_ALLOWED',label+' cannot preview/export care snapshots')
denied(None,out(),'AUTH_REQUIRED','Missing identity denied')
r=run('set role anon;'+out(),ok=False);assert r.returncode and 'permission denied' in r.stderr;passed('Anonymous function execution denied')
for scope,label in [('20000000-0000-0000-0000-000000000001','organization'),('30000000-0000-0000-0000-000000000001','entity'),('40000000-0000-0000-0000-000000000001','program')]:denied(107,out(scope=scope),'NOT_FOUND_OR_NOT_ALLOWED','Foreign '+label+' cannot substitute note ID')
for i in [101,102]:
 r=call(i,out('export'));assert r['note_id']==note and str(r['revision'])==revision;passed('Assigned '+str(i)+' exports exact revision')
assert call(105,out())['snapshot']['watermark'];passed('Explicit Observer previews exact revision')
denied(105,out('export'),'NOT_FOUND_OR_NOT_ALLOWED','Observer direct export denied')
run("update md02.scope set observer_enabled=false where id="+quote(S))
try:denied(105,out(),'NOT_FOUND_OR_NOT_ALLOWED','Disabled Observer scope blocks direct preview')
finally:run("update md02.scope set observer_enabled=true where id="+quote(S))
denied(101,out(num=999),'NOT_FOUND_OR_NOT_ALLOWED','Unknown revision discloses no output')
denied(101,out(mode='anything'),'VALIDATION_FAILED','Output mode allowlist enforced')
assert run("select has_table_privilege('authenticated','md02.revision','select')").stdout.strip()=='f';passed('No direct revision table access granted')
assert run("select has_function_privilege('anon','md02.revision_output(uuid,uuid,integer,text)','execute')").stdout.strip()=='f';passed('New definer has no anonymous execute grant')
assert run("select proconfig @> array['search_path=\"\"'] from pg_proc where oid='md02.revision_output(uuid,uuid,integer,text)'::regprocedure").stdout.strip()=='t' ;passed('Output function fixes empty search path')
# Revoke membership while holding the scope gate, then ensure pending output fails.
def race(first,second):
 tag='md02-c-'+uuid.uuid4().hex;proc=subprocess.Popen(base+['-d',db],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=dict(env,PGAPPNAME=tag));proc.stdin.write('begin;'+first+';select pg_sleep(1.1);commit;');proc.stdin.close()
 for _ in range(200):
  if run("select count(*) from pg_stat_activity where application_name="+quote(tag)+" and wait_event='PgSleep'").stdout.strip()=='1':break
  time.sleep(.015)
 else:raise AssertionError('race did not reach held transaction')
 r=run(second,ok=False);stderr=proc.stderr.read();proc.stdout.read();assert proc.wait(timeout=4)==0,stderr
 assert r.returncode and 'NOT_FOUND_OR_NOT_ALLOWED' in r.stderr
version=run('select version from md02.membership where scope_id='+quote(S)+' and actor_id='+quote(uid(101))).stdout.strip()
first='set local role authenticated;set local request.jwt.claim.sub='+quote(uid(103))+';select md02.set_member_active('+','.join(map(quote,[S,uid(101)]))+',false,'+version+',1)'
try:race(first,actor(101,out('export')));passed('Membership revocation serializes before a pending export')
finally:call(103,'select md02.set_member_active('+quote(S)+','+quote(uid(101))+',true,'+str(int(version)+1)+',1)')
# Metadata events never contain note bodies; original fleet audit remains separate.
columns=run("select string_agg(column_name,',') from information_schema.columns where table_schema='md02' and table_name='event'").stdout
assert not any(x in columns for x in ['fields','snapshot','source_text','reason']);passed('Preview/export event schema contains metadata only')
assert run("select count(*) from public.audit_log where coalesce(new_data::text,'') like '%MD02_UNSAFE_EXECUTION%'").stdout.strip()=='0';passed('Care text absent from generic fleet audit')
# Preserve full ACLs, restore into a clean database and compare every care table.
tables=run("select tablename from pg_tables where schemaname='md02' order by tablename").stdout.splitlines()
def digests(database):return {t:hashlib.sha256(run('select row_to_json(x)::text from md02.'+t+' x order by row_to_json(x)::text',database).stdout.encode()).hexdigest() for t in tables}
before=digests(db);restore='missionos_md02_c_'+uuid.uuid4().hex[:10]+'_restore_test';run('create database '+restore,'postgres')
dump=subprocess.run([str(Path(c['psql']).with_name('pg_dump')),'-h',c['socket'],'-p',str(c['port']),'-U',os.environ['USER'],'-d',db,'--no-owner'],capture_output=True,text=True,env=env);assert dump.returncode==0
run(dump.stdout,restore);assert before==digests(restore);passed('C schema clean restore matches all 13 care-table digests')
assert run("select has_function_privilege('authenticated','md02.revision_output(uuid,uuid,integer,text)','execute')",restore).stdout.strip()=='t'
assert run("select has_function_privilege('anon','md02.revision_output(uuid,uuid,integer,text)','execute')",restore).stdout.strip()=='f';passed('Restored output grants retain authenticated/anonymous boundary')
result=json.loads(run(actor(102,out('preview')),restore).stdout);assert result['note_id']==note;passed('Restored exact-revision preview executes with scoped authorization')
report=Path(a.report);backup=report.with_suffix('.sql.gz');backup.write_bytes(gzip.compress(dump.stdout.encode(),mtime=0));report.write_text(json.dumps({'status':'pass','checks':checks,'count':len(checks),'care_table_digests':before,'restore_database':restore,'backup_sha256':hashlib.sha256(backup.read_bytes()).hexdigest(),'scope':'local fictional PostgreSQL layer; no hosted changes'},indent=2)+'\n');print('MD02_C_DATABASE_COMPLETE',len(checks))
