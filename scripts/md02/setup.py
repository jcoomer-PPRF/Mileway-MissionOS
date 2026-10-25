#!/usr/bin/env python3
"""Create a fresh, fictional-only local cluster. No existing database is reset."""
import argparse,json,os,re,secrets,shutil,stat,subprocess,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--observer',action='store_true',help='Explicitly enable the training-only observer scope');p.add_argument('--pg-bin',default='/opt/homebrew/opt/postgresql@17/bin');p.add_argument('--app-port',type=int,default=5175);p.add_argument('--gateway-port',type=int,default=5176);p.add_argument('--pg-port',type=int,default=55433);a=p.parse_args()
if any(x<1024 or x>65535 for x in [a.app_port,a.gateway_port,a.pg_port]) or a.app_port==a.gateway_port:raise SystemExit('Invalid local ports')
root=Path(a.root)
if not re.fullmatch(r'/private/tmp/missionos-md02-[a-zA-Z0-9_-]+',str(root)) or root.exists():raise SystemExit('A NEW /private/tmp/missionos-md02-* directory is required')
root.mkdir(mode=0o700);sock=root/'socket';sock.mkdir(mode=0o700)
repo=Path(__file__).resolve().parents[2];pg=Path(a.pg_bin);env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
def run(argv,**kw):return subprocess.run([str(x) for x in argv],check=True,env=env,**kw)
run([pg/'initdb','-D',root/'pgdata','--auth-local=trust','--auth-host=reject','--no-locale','-E','UTF8'],stdout=subprocess.DEVNULL)
run([pg/'pg_ctl','-D',root/'pgdata','-l',root/'postgres.log','-o',f"-k {sock} -p {a.pg_port} -c listen_addresses='' -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse",'start'],stdout=subprocess.DEVNULL)
try:
 base=[pg/'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h',sock,'-p',str(a.pg_port),'-U',os.environ['USER']]
 db='missionos_md02_browser_test'
 def sql(s,database='postgres'):return run(base+['-d',database],input=s,text=True,capture_output=True).stdout
 sql('create database '+db);sql("alter database "+db+" set missionos.md02_disposable='fictional-training-only'")
 def apply(path):run(base+['-d',db,'-1','-f',path],capture_output=True,text=True)
 apply(repo/'supabase/tests/shim.sql')
 for f in sorted((repo/'supabase/migrations').glob('*.sql')):apply(f)
 apply(repo/'supabase/tests/fixtures.sql')
 for f in sorted((repo/'supabase/pilots/md02/migrations').glob('*.sql')):apply(f)
 for f in sorted((repo/'supabase/pilots/md02c/migrations').glob('*.sql')):apply(f)
 # Reuse versioned A fixtures, but only one ALPHA encounter plus blocked BETA.
 fixture=(repo/'supabase/pilots/md02/tests/fixtures.sql').read_text().replace('generate_series(1,20)','generate_series(1,1)')
 sql(fixture,db)
 if a.observer:
  sql("update md02.scope set observer_enabled=true where id='10000000-0000-0000-0000-000000000001'; insert into md02.event(scope_id,actor_id,kind) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000103','training_observer_enabled')",db)
 sql("create role md02_gateway login noinherit nosuperuser nocreatedb nocreaterole noreplication; grant authenticated to md02_gateway; grant connect on database "+db+" to md02_gateway")
 accounts=[{'username':n,'id':f'00000000-0000-0000-0000-{i:012d}','label':label,'password':secrets.token_urlsafe(12)} for n,i,label in [('training-author',101,'TRAINING Author'),('training-reviewer',102,'TRAINING Reviewer'),('training-unassigned',108,'TRAINING Unassigned'),('training-observer',105,'TRAINING Observer')]]
 config={'socket':str(sock),'port':a.pg_port,'database':db,'psql':str(pg/'psql'),'accounts':accounts,'origin':f'http://127.0.0.1:{a.app_port}','httpPort':a.gateway_port}
 (root/'gateway.json').write_text(json.dumps(config,indent=2));(root/'gateway.json').chmod(0o600)
 (root/'training-login.txt').write_text('FICTIONAL LOCAL TRAINING LOGINS ONLY\n'+''.join(x['username']+'  '+x['password']+'\n' for x in accounts));(root/'training-login.txt').chmod(0o600)
 print(json.dumps({'status':'ready','root':str(root),'config':str(root/'gateway.json'),'login_file':str(root/'training-login.txt'),'database':db}))
except BaseException:
 subprocess.run([str(pg/'pg_ctl'),'-D',str(root/'pgdata'),'stop','-m','fast'],env=env,capture_output=True)
 raise
