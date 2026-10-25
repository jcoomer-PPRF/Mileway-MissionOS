#!/usr/bin/env python3
"""Disposable Unix-socket PostgreSQL verification; standard library only.
Not a hosted Supabase/Auth/PostgREST test. Never accepts a URL or remote host.
"""
import argparse,datetime,hashlib,json,os,re,stat,subprocess,time,uuid
from pathlib import Path
PILOT=Path(__file__).resolve().parents[1]; ROOT=PILOT.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--socket',required=True);parser.add_argument('--port',default='55432');parser.add_argument('--report',required=True)
args=parser.parse_args(); sock=Path(args.socket).resolve(); cluster=sock.parent/'pgdata'
if not str(sock).startswith('/private/tmp/missionos-md02-') or sock.name!='socket' or sock.is_symlink() or not sock.is_dir() or stat.S_IMODE(sock.stat().st_mode)!=0o700 or sock.stat().st_uid!=os.getuid():
 raise SystemExit('MD02_DISPOSABLE_LOCAL_SOCKET_REQUIRED')
if not args.port.isdigit():raise SystemExit('Invalid port')
env={k:v for k,v in os.environ.items() if not k.startswith('PG')};env['PGAPPNAME']='md02-test'
psql=os.environ.get('MD02_PSQL','/opt/homebrew/opt/postgresql@17/bin/psql')
base=[psql,'-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(sock),'-p',args.port,'-U',os.environ.get('USER','homeoffice')]
db='missionos_md02_'+datetime.datetime.now().strftime('%Y%m%d_%H%M%S')+'_test';checks=[]
def raw(sql,database=None,ok=True):
 r=subprocess.run(base+['-d',database or db],input=sql,text=True,capture_output=True,env=env)
 if ok and r.returncode:raise AssertionError(r.stderr[-1600:])
 return r
info=raw('select current_setting(\'data_directory\'); select inet_server_addr() is null;','postgres').stdout.splitlines()
if info!=[str(cluster),'t']:raise SystemExit('MD02_CLUSTER_IDENTITY_MISMATCH')
raw('create database '+db,'postgres')
raw("alter database "+db+" set missionos.md02_disposable='fictional-training-only'",'postgres')
def apply(path):
 r=subprocess.run(base+['-d',db,'-1','-f',str(path)],text=True,capture_output=True,env=env)
 if r.returncode:raise AssertionError(str(path)+'\n'+r.stderr[-2500:])
apply(ROOT/'supabase/tests/shim.sql')
for path in sorted((ROOT/'supabase/migrations').glob('*.sql')):apply(path)
apply(ROOT/'supabase/tests/fixtures.sql')
for path in sorted((PILOT/'migrations').glob('*.sql')):apply(path)
for path in sorted((ROOT/'supabase/pilots/md02c/migrations').glob('*.sql')):apply(path)
apply(PILOT/'tests/fixtures.sql')
def q(v):
 if v is None:return 'null'
 if isinstance(v,bool):return 'true' if v else 'false'
 if isinstance(v,(dict,list)):return "'"+json.dumps(v).replace("'","''")+"'::jsonb"
 return "'"+str(v).replace("'","''")+"'"
def uid(i):return f'00000000-0000-0000-0000-{i:012d}'
S='10000000-0000-0000-0000-000000000001'
def enc(i):return f'70000000-0000-0000-0000-{i:012d}'
def as_actor(actor,sql,role='authenticated'):
 return 'begin; set local role '+role+'; set local request.jwt.claim.sub='+q(uid(actor) if actor else '')+'; '+sql+'; commit;'
def query(actor,sql,role='authenticated'):
 out=raw(as_actor(actor,sql,role)).stdout.strip();return json.loads(out) if out else None
def expect_error(label,actor,sql,error,role='authenticated'):
 r=raw(as_actor(actor,sql,role),ok=False)
 assert r.returncode and error in r.stderr,(label,r.stdout,r.stderr[-1000:]);passed(label)
def passed(label):checks.append(label);print('PASS:',label,flush=True)
def cmdsql(command,note=None,rv=0,payload=None,e=1,req=None,av=1,mv=1,scope=S):
 return 'select md02.command('+','.join(map(q,[scope,enc(e),note,req or str(uuid.uuid4()),rv,av,mv,command,payload or {}]))+')'
def cmd(command,note=None,rv=0,payload=None,actor=101,**kw):return query(actor,cmdsql(command,note,rv,payload,**kw))
def read(note,actor=101,scope=S):return query(actor,'select md02.read_note('+q(scope)+','+q(note)+')')
fields={k:'TRAINING placeholder '+k+'; no service occurred.' for k in ['subjective','objective','assessment','plan','intervention','response','goal_connection']}
def ready(e):
 n=cmd('create_note',e=e); n=cmd('save_draft',n['note_id'],n['row_version'],{'fields':fields},e=e)
 return cmd('check_source',n['note_id'],n['row_version'],{'content_version':n['content_version'],'attested':True},e=e)
def submitted(e):
 n=ready(e);return cmd('submit_note',n['note_id'],n['row_version'],e=e)
# Lifecycle and persistence across actual connections.
n=cmd('create_note'); nid=n['note_id'];r=read(nid);assert r['draft']['fields']['subjective']=='';passed('Create assigned empty draft; read through authenticated command')
expect_error('Required fields/source check gate submit',101,cmdsql('submit_note',nid,1),'VALIDATION_FAILED')
n=cmd('save_draft',nid,1,{'fields':fields});assert read(nid)['draft']['fields']==fields;passed('AT01/02 database save survives independent session')
expect_error('Stale row version cannot overwrite',101,cmdsql('save_draft',nid,1,{'fields':fields}),'VERSION_CONFLICT')
expect_error('Reviewer cannot read unsubmitted prose',102,'select md02.read_note('+q(S)+','+q(nid)+')','NOT_FOUND_OR_NOT_ALLOWED')
a=query(103,'select md02.list_encounters('+q(S)+')');assert all(x['author_context'] is None for x in a);passed('Assignment administrator metadata contains no source/goal/note prose')
expect_error('Administrator cannot read draft',103,'select md02.read_note('+q(S)+','+q(nid)+')','NOT_FOUND_OR_NOT_ALLOWED')
expect_error('Anonymous role cannot execute',None,cmdsql('create_note',e=2),'permission denied','anon')
expect_error('Authenticated missing identity fails',None,cmdsql('create_note',e=2),'AUTH_REQUIRED')
for role in ['owner','manager','contributor','accountant','auditor']:
 # Fleet role is changed only by disposable fixture owner, never a care command.
 query(1,'update public.profiles set role='+q(role)+' where id='+q(uid(108)))
 expect_error('Fleet '+role+' inherits no care access',108,'select md02.read_note('+q(S)+','+q(nid)+')','NOT_FOUND_OR_NOT_ALLOWED')
for table in ['note','revision','event','membership','request_result']:
 expect_error('Direct SELECT denied '+table,101,'select * from md02.'+table,'permission denied')
expect_error('Direct note write denied',101,'update md02.note set fields=\'{}\'','permission denied')
expect_error('Direct membership self grant denied',108,'update md02.membership set author=true','permission denied')
# RLS still denies if SELECT is accidentally granted (rolled back after test).
raw('grant select on md02.note to authenticated');assert query(101,'select count(*) from md02.note')==0;raw('revoke select on md02.note from authenticated');passed('RLS default deny survives accidental table SELECT grant')
for scope in ['20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001']:
 expect_error('Cross scope note ID substitution denied '+scope[0],107,'select md02.read_note('+q(scope)+','+q(nid)+')','NOT_FOUND_OR_NOT_ALLOWED')
 expect_error('Cross scope mutation denied '+scope[0],107,cmdsql('save_draft',nid,2,{'fields':fields},scope=scope),'NOT_FOUND_OR_NOT_ALLOWED')
 expect_error('Cross scope discovery denied '+scope[0],101,'select md02.list_encounters('+q(scope)+')','NOT_FOUND_OR_NOT_ALLOWED')
expect_error('Forged actor/state envelope rejected',101,cmdsql('save_draft',nid,2,{'fields':fields,'actor_id':uid(102),'state':'reviewed'}),'VALIDATION_FAILED')
expect_error('Foreign participant/goal/context edits rejected',101,cmdsql('save_draft',nid,2,{'metadata':{'participant_id':str(uuid.uuid4())}}),'VALIDATION_FAILED')
for bad in [dict(fields,subjective=' \t\n'),dict(fields,subjective='x'*10001),dict(fields,subjective=4),dict(fields,extra='forged')]:
 if bad['subjective']==' \t\n':
  assert cmd('save_draft',nid,2,{'fields':bad})['row_version']==3
  n=cmd('check_source',nid,3,{'content_version':3,'attested':True})
  expect_error('Whitespace cannot pass submission',101,cmdsql('submit_note',nid,n['row_version']),'VALIDATION_FAILED');n=cmd('save_draft',nid,n['row_version'],{'fields':fields})
 else:expect_error('Field type/length/allowlist validation '+str(len(checks)),101,cmdsql('save_draft',nid,n['row_version'],{'fields':bad}),'VALIDATION_FAILED')
n=cmd('check_source',nid,n['row_version'],{'content_version':n['content_version'],'attested':True});cv=n['content_version']
n=cmd('save_draft',nid,n['row_version'],{'metadata':{'service_date':'2026-10-24'}});assert n['content_version']==cv+1
expect_error('Metadata edit invalidates source check',101,cmdsql('submit_note',nid,n['row_version']),'VALIDATION_FAILED')
n=cmd('check_source',nid,n['row_version'],{'content_version':n['content_version'],'attested':True})
req=str(uuid.uuid4());sql=cmdsql('submit_note',nid,n['row_version'],req=req);sub=query(101,sql);assert query(101,sql)==sub;passed('Idempotent submission replays identical metadata once')
expect_error('Request ID reuse with changed payload fails',101,cmdsql('save_draft',nid,n['row_version'],{'fields':fields},req=req),'REQUEST_ID_REUSED')
expect_error('Submitted note cannot be edited',101,cmdsql('save_draft',nid,sub['row_version'],{'fields':fields}),'INVALID_STATE')
r=read(nid,102);assert r['draft'] is None and len(r['revisions'])==1;rev1=r['revisions'][0];passed('Reviewer receives exact immutable snapshot, no working draft')
expect_error('Return requires reason',102,cmdsql('return_note',nid,sub['row_version'],{'revision':1,'reason':' \t'}),'VALIDATION_FAILED')
expect_error('Review requires exact revision',102,cmdsql('accept_note',nid,sub['row_version'],{'revision':2}),'VERSION_CONFLICT')
expect_error('Author cannot self review',101,cmdsql('accept_note',nid,sub['row_version'],{'revision':1}),'NOT_FOUND_OR_NOT_ALLOWED')
n=cmd('return_note',nid,sub['row_version'],{'revision':1,'reason':'TRAINING reviewer request'},actor=102);assert read(nid,102)['draft'] is None
n=cmd('save_draft',nid,n['row_version'],{'fields':dict(fields,plan='TRAINING revised placeholder')});n=cmd('check_source',nid,n['row_version'],{'content_version':n['content_version'],'attested':True});n=cmd('submit_note',nid,n['row_version'])
r=read(nid,102);assert r['revisions'][0]==rev1 and len(r['revisions'])==2 and len(r['reviews'])==1;passed('Return/resubmit preserves revision 1 and reviewer reason')
n=cmd('accept_note',nid,n['row_version'],{'revision':2},actor=102);reviewed=json.dumps(read(nid)['revisions'],sort_keys=True)
expect_error('Reviewed original remains locked',101,cmdsql('save_draft',nid,n['row_version'],{'fields':fields}),'INVALID_STATE')
corr=cmd('start_correction',nid,n['row_version'],{'reason':'TRAINING correction reason'});assert corr['note_id']!=nid and read(corr['note_id'])['parent_id']==nid and json.dumps(read(nid)['revisions'],sort_keys=True)==reviewed;passed('Linked correction preserves reviewed original and full history')
expect_error('Second active correction denied',101,cmdsql('start_correction',nid,n['row_version'],{'reason':'TRAINING duplicate'}),'INVALID_STATE')
b=cmd('create_note',e=99);b=cmd('save_draft',b['note_id'],1,{'fields':fields},e=99)
expect_error('BETA cannot attest away known source gap',101,cmdsql('check_source',b['note_id'],b['row_version'],{'content_version':b['content_version'],'attested':True},e=99),'VALIDATION_FAILED')
expect_error('BETA cannot submit arbitrary filled fields',101,cmdsql('submit_note',b['note_id'],b['row_version'],e=99),'VALIDATION_FAILED')
# Observer is explicit, scoped and read-only.
expect_error('Observer default disabled',105,'select md02.read_note('+q(S)+','+q(nid)+')','NOT_FOUND_OR_NOT_ALLOWED')
raw('update md02.scope set observer_enabled=true where id='+q(S));assert read(nid,105)['draft'] is None;passed('Explicit training observer sees submitted history only')
expect_error('Observer cannot mutate',105,cmdsql('save_draft',corr['note_id'],1,{'fields':fields}),'NOT_FOUND_OR_NOT_ALLOWED')
raw('update md02.scope set observer_enabled=false where id='+q(S))
# Assignment history and re-verification.
x=ready(2);oldauth=read(x['note_id'])['original_author_id']
expect_error('Admin cannot assign self',103,'select md02.set_assignment('+','.join(map(q,[S,enc(2),1,1,uid(103),uid(102),True]))+')','NOT_FOUND_OR_NOT_ALLOWED')
query(103,'select md02.set_assignment('+','.join(map(q,[S,enc(2),1,1,uid(104),uid(102),True]))+')')
r=read(x['note_id'],104);assert r['original_author_id']==oldauth and not r['draft']['checked'];passed('Reassignment preserves authorship and invalidates source verification')
expect_error('Previous author loses assigned access',101,'select md02.read_note('+q(S)+','+q(x['note_id'])+')','NOT_FOUND_OR_NOT_ALLOWED')
expect_error('Assignment version conflict',104,cmdsql('save_draft',x['note_id'],r['row_version'],{'fields':fields},e=2),'VERSION_CONFLICT')
# Authenticated identity cannot invoke internal helpers even with schema usage.
expect_error('Internal lock helper not callable',101,'select md02.lock_actor('+q(S)+')','permission denied')
# Real competing sessions; first session holds its transaction after the command.
def race(first_actor,first_sql,second_actor,second_sql,expected_error):
 race_id='md02-race-'+uuid.uuid4().hex
 race_env=dict(env,PGAPPNAME=race_id)
 sql=as_actor(first_actor,first_sql+'; select pg_sleep(1.2)')
 a=subprocess.Popen(base+['-d',db],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=race_env)
 a.stdin.write(sql);a.stdin.close()
 for _ in range(200):
  if raw("select count(*) from pg_stat_activity where application_name="+q(race_id)+" and wait_event='PgSleep'").stdout.strip()=='1':break
  time.sleep(.015)
 else:raise AssertionError('First race transaction did not reach held state')
 r=raw(as_actor(second_actor,second_sql),ok=False)
 out=a.stdout.read();err=a.stderr.read();assert a.wait(timeout=5)==0,err
 assert r.returncode and expected_error in r.stderr,(r.stdout,r.stderr)
 return out
x=ready(3);first=cmdsql('save_draft',x['note_id'],x['row_version'],{'fields':dict(fields,plan='TRAINING race winner')},e=3)
second=cmdsql('save_draft',x['note_id'],x['row_version'],{'fields':dict(fields,plan='TRAINING race loser')},e=3)
race(101,first,101,second,'VERSION_CONFLICT');assert read(x['note_id'])['draft']['fields']['plan']=='TRAINING race winner';passed('Concurrent saves: one commit, stale writer conflicts, no overwrite')
x=submitted(4);before=int(raw('select count(*) from md02.review_action').stdout)
race(102,cmdsql('return_note',x['note_id'],x['row_version'],{'revision':1,'reason':'TRAINING race return'},e=4),102,cmdsql('accept_note',x['note_id'],x['row_version'],{'revision':1},e=4),'VERSION_CONFLICT')
assert int(raw('select count(*) from md02.review_action').stdout)==before+1;passed('Concurrent return/accept: one transition and one review/event')
x=ready(5);req=str(uuid.uuid4());sql=cmdsql('save_draft',x['note_id'],x['row_version'],{'fields':fields},e=5,req=req);query(101,sql)
revoke='select md02.set_member_active('+','.join(map(q,[S,uid(101),False,1,1]))+')'
race(103,revoke,101,sql,'NOT_FOUND_OR_NOT_ALLOWED');expect_error('Revoked actor replay reveals no result',101,sql,'NOT_FOUND_OR_NOT_ALLOWED')
query(103,'select md02.set_member_active('+','.join(map(q,[S,uid(101),True,2,1]))+')');passed('Membership revocation commits before pending save; stale replay denied')
# save-first ordering holds profile/scope locks; revocation waits then denies future access.
x=cmd('create_note',e=6,mv=3);first=cmdsql('save_draft',x['note_id'],1,{'fields':fields},e=6,mv=3)
# Separate revoker succeeds after first commit, unlike stale writer races.
def succeeds_after(first_actor,first_sql,second_sql,second_actor=None):
 tag='md02-order-'+uuid.uuid4().hex;a=subprocess.Popen(base+['-d',db],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=dict(env,PGAPPNAME=tag));a.stdin.write(as_actor(first_actor,first_sql+'; select pg_sleep(1.2)'));a.stdin.close()
 for _ in range(200):
  if raw("select count(*) from pg_stat_activity where application_name="+q(tag)+" and wait_event='PgSleep'").stdout.strip()=='1':break
  time.sleep(.015)
 else:raise AssertionError('First ordered transaction did not reach held state')
 raw(as_actor(second_actor,second_sql) if second_actor else second_sql);out=a.stdout.read();err=a.stderr.read();assert a.wait(timeout=5)==0,err
succeeds_after(101,first,'select md02.set_member_active('+','.join(map(q,[S,uid(101),False,3,1]))+')',103)
expect_error('Save-first then revocation denies next read',101,'select md02.read_note('+q(S)+','+q(x['note_id'])+')','NOT_FOUND_OR_NOT_ALLOWED')
query(103,'select md02.set_member_active('+','.join(map(q,[S,uid(101),True,4,1]))+')');passed('Save-first commits before membership revocation without partial work')
# Profile inactivity is checked independently of care membership and JWT.
x=cmd('create_note',e=7,mv=5)
succeeds_after(101,cmdsql('save_draft',x['note_id'],1,{'fields':fields},e=7,mv=5),'update public.profiles set is_active=false where id='+q(uid(101)),1)
expect_error('Stored profile inactivity overrides stale identity',101,'select md02.read_note('+q(S)+','+q(x['note_id'])+')','NOT_FOUND_OR_NOT_ALLOWED')
query(1,'update public.profiles set is_active=true where id='+q(uid(101)));passed('Account deactivation serializes with in-flight save')
# Reassignment-first denies stale author; self-review denied even with both capabilities.
x=cmd('create_note',e=8,mv=5)
race(103,'select md02.set_assignment('+','.join(map(q,[S,enc(8),1,1,uid(104),uid(102),True]))+')',101,cmdsql('save_draft',x['note_id'],1,{'fields':fields},e=8,mv=5),'NOT_FOUND_OR_NOT_ALLOWED');passed('Reassignment-first denies in-flight prior author save')
# Constraint/immutability checks are exercised as the local fixture owner too.
for table in ['revision','review_action','event','request_result','assignment_history','goal_version','template_version']:
 r=raw('update md02.'+table+' set '+({'revision':'number=number','review_action':'revision=revision','event':'kind=kind','request_result':'fingerprint=fingerprint','assignment_history':'version=version','goal_version':'body=body','template_version':'id=id'}[table]),ok=False)
 assert r.returncode and 'MD02_APPEND_ONLY' in r.stderr;passed('Immutable '+table+' rejects update')
# A failure after row/revision/event updates must roll the entire command back.
x=cmd('create_note',e=9,mv=5);x=cmd('save_draft',x['note_id'],1,{'fields':fields},e=9,mv=5)
x=cmd('check_source',x['note_id'],x['row_version'],{'content_version':x['content_version'],'attested':True},e=9,mv=5)
before_state=raw("select to_jsonb(n)::text from md02.note n where id="+q(x['note_id'])).stdout
before_counts=raw('select (select count(*) from md02.revision),(select count(*) from md02.event),(select count(*) from md02.request_result)').stdout
raw("create function md02.test_fail() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_COMMIT_FAILURE'; end $$; create trigger test_fail before insert on md02.request_result for each row execute function md02.test_fail()")
expect_error('Injected failure after writes rolls back command',101,cmdsql('submit_note',x['note_id'],x['row_version'],e=9,mv=5),'INJECTED_COMMIT_FAILURE')
assert before_state==raw("select to_jsonb(n)::text from md02.note n where id="+q(x['note_id'])).stdout
assert before_counts==raw('select (select count(*) from md02.revision),(select count(*) from md02.event),(select count(*) from md02.request_result)').stdout
raw('drop trigger test_fail on md02.request_result; drop function md02.test_fail()');passed('No partial note, snapshot, event or request result after failure')
# Unicode whitespace cannot masquerade as a completed field or return reason.
x=cmd('save_draft',x['note_id'],x['row_version'],{'fields':dict(fields,subjective='\u00a0\u2003')},e=9,mv=5)
x=cmd('check_source',x['note_id'],x['row_version'],{'content_version':x['content_version'],'attested':True},e=9,mv=5)
expect_error('Unicode whitespace is incomplete',101,cmdsql('submit_note',x['note_id'],x['row_version'],e=9,mv=5),'VALIDATION_FAILED')
# Scope administrator cannot expand capabilities or self-reactivate.
expect_error('Admin cannot change own membership status',103,'select md02.set_member_active('+','.join(map(q,[S,uid(103),False,1,1]))+')','NOT_FOUND_OR_NOT_ALLOWED')
# Reviewer revocation also serializes with decisions.
x=cmd('create_note',e=10,mv=5);x=cmd('save_draft',x['note_id'],1,{'fields':fields},e=10,mv=5);x=cmd('check_source',x['note_id'],x['row_version'],{'content_version':x['content_version'],'attested':True},e=10,mv=5);x=cmd('submit_note',x['note_id'],x['row_version'],e=10,mv=5)
race(103,'select md02.set_member_active('+','.join(map(q,[S,uid(102),False,1,1]))+')',102,cmdsql('accept_note',x['note_id'],x['row_version'],{'revision':1},e=10),'NOT_FOUND_OR_NOT_ALLOWED')
query(103,'select md02.set_member_active('+','.join(map(q,[S,uid(102),True,2,1]))+')');passed('Reviewer revocation commits before decision; decision denied')
assert raw("select count(*) from md02.event where kind='membership_status_changed' and (subject_actor_id is null or subject_member_version is null or subject_active is null)").stdout.strip()=='0';passed('Membership audit records target/version/status without prose')
# Privacy and permissions metadata, not Supabase advisors (no hosted stack here).
assert raw("select count(*) from public.audit_log where table_name like 'md02%' or coalesce(new_data::text,'') like '%TRAINING placeholder%'").stdout.strip()=='0';passed('Care note prose absent from fleet audit')
assert raw("select count(*) from pg_tables where schemaname='md02' and not rowsecurity").stdout.strip()=='0';passed('All care tables have RLS enabled')
assert raw("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='md02' and has_function_privilege('anon',p.oid,'EXECUTE')").stdout.strip()=='0';passed('Anonymous has no executable care functions')
assert raw("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='md02' and p.prosecdef and not (p.proconfig @> array['search_path=\"\"'])").stdout.strip()=='0';passed('Every definer function fixes an empty search path')
# Fleet permissions and integrity still hold with the care schema present.
for filename in ['role_matrix.sql','integrity.sql']:
 proc=subprocess.run(base+['-d',db,'-f',str(ROOT/'supabase/tests'/filename)],capture_output=True,text=True,env=env)
 assert proc.returncode==0 and 'FAIL:' not in proc.stdout+proc.stderr,(filename,proc.stderr[-1600:])
 if filename=='role_matrix.sql':
  assert 'MATRIX_COMPLETE' in proc.stdout and len(re.findall(r'PASS:',proc.stdout+proc.stderr))==60
passed('Existing 60-role matrix and integrity checks pass with MD02 schema present')
# Migration guard also fails on the actual local postgres database before DDL.
guard=(next((PILOT/'migrations').glob('*.sql')).read_text().split('create schema md02;')[0])
r=raw(guard,'postgres',ok=False);assert r.returncode and 'MD02_DISPOSABLE_LOCAL_TARGET_REQUIRED' in r.stderr
assert raw("select count(*) from pg_namespace where nspname='md02'",'postgres').stdout.strip()=='0';passed('AT28 SQL guard rejects ordinary database before schema creation')
# Full logical dump/restore (the shim plus fleet plus care); compare stable data digests.
relation_names=[x for x in raw("select tablename from pg_tables where schemaname='md02' order by tablename").stdout.splitlines()]
def digests(database):
 return {table:hashlib.sha256(raw('select row_to_json(t)::text from md02.'+table+' t order by row_to_json(t)::text',database).stdout.encode()).hexdigest() for table in relation_names}
before=digests(db);restore=db.replace('_test','_restore_test');raw('create database '+restore,'postgres')
dumpbin=str(Path(psql).with_name('pg_dump'));dump=subprocess.run([dumpbin,'-h',str(sock),'-p',args.port,'-U',os.environ.get('USER','homeoffice'),'-d',db,'--no-owner','--no-privileges'],capture_output=True,text=True,env=env);assert dump.returncode==0,dump.stderr
raw(dump.stdout,restore);assert before==digests(restore);passed('AT26 clean logical restore matches all care table digests')
# Dump without grants is data-integrity evidence only; permission roundtrip verified below.
full_dump=subprocess.run([dumpbin,'-h',str(sock),'-p',args.port,'-U',os.environ.get('USER','homeoffice'),'-d',db,'--no-owner'],capture_output=True,text=True,env=env);assert full_dump.returncode==0
restore2=db.replace('_test','_permissions_test');raw('create database '+restore2,'postgres');raw(full_dump.stdout,restore2)
assert before==digests(restore2)
assert raw('select has_table_privilege(\'authenticated\',\'md02.note\',\'SELECT\')',restore2).stdout.strip()=='f'
assert raw('select has_function_privilege(\'authenticated\',\'md02.read_note(uuid,uuid)\',\'EXECUTE\')',restore2).stdout.strip()=='t';passed('Restore preserves command grants and denies direct table reads')
report={'status':'pass','scope':'MD02 A PostgreSQL database layer only','checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'database':db,'restore_databases':[restore,restore2],'postgres':raw('show server_version').stdout.strip(),'checks':checks,'count':len(checks),'care_table_digests':before,'limitations':['Auth JWT claim shim only; no real Supabase Auth/PostgREST/advisors','No browser screens/autosave/mobile/export tests in MD02 A','Private per-scope gate serializes local pilot; no performance claim','No production or cloud mutation'],'source_hashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(list((PILOT/'migrations').glob('*.sql'))+list((ROOT/'supabase/pilots/md02c/migrations').glob('*.sql')))}}
Path(args.report).write_text(json.dumps(report,indent=2)+'\n');print('MD02_A_COMPLETE',len(checks),db,flush=True)
