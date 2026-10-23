\set ON_ERROR_STOP on
create function pg_temp.verify(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %',description; end if;
  raise notice 'PASS: %',description;
end $$;

begin;
do $$ begin
  begin
    insert into auth.users(id,email) values(gen_random_uuid(),'uninvited@test.local');
    raise exception 'FAIL: uninvited signup succeeded';
  exception when others then
    if sqlerrm not like 'An invitation is required.%' then raise; end if;
  end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin
  begin
    insert into public.user_invitations(email) values('outsider@test.local');
    raise exception 'FAIL: contributor invited a user';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

begin;
insert into public.user_invitations(email,role,expires_at) values
 ('expired@test.local','manager',now()-interval '1 second'),
 ('invited-manager@test.local','manager',now()+interval '1 hour');
do $$ begin
  begin
    insert into auth.users(email) values('expired@test.local');
    raise exception 'FAIL: expired invitation accepted';
  exception when others then
    if sqlerrm not like 'An invitation is required.%' then raise; end if;
  end;
end $$;
insert into auth.users(email) values('invited-manager@test.local');
select pg_temp.verify((select role='manager' from public.profiles where email='invited-manager@test.local'),
  'invited accounts receive their explicitly granted role');
select pg_temp.verify((select accepted_at is not null from public.user_invitations where email='invited-manager@test.local'),
  'account creation consumes its invitation');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin
  begin
    perform public.request_user_access(auth.uid(),true);
    raise exception 'FAIL: contributor requested account management';
  exception when others then
    if sqlerrm not like 'Only an active owner%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin
  begin
    perform public.request_user_access(auth.uid(),false,'{"full_name":"must roll back"}');
    raise exception 'FAIL: last owner deactivated';
  exception when others then
    if sqlerrm not like 'Cannot demote or deactivate the last active owner%' then raise; end if;
  end;
  perform pg_temp.verify((select is_active and full_name is distinct from 'must roll back'
    from public.profiles where id=auth.uid()),'rejected account edits roll back fields and status together');
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update public.documents set profile_id='00000000-0000-0000-0000-000000000002'
  where id='33333333-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select pg_temp.verify((select count(*)=0 from storage.objects where name like '%/bylaws.pdf'),
  'rescoping a document immediately hides its existing file from unrelated contributors');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.verify((select count(*)=1 from storage.objects where name like '%/bylaws.pdf'),
  'document subject can read a personal attachment at a legacy path');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
insert into storage.objects(bucket_id,name,owner) values
  ('receipts','legacy-receipt.pdf',auth.uid()),
  ('receipts','regression-receipt.pdf',auth.uid());
insert into storage.objects(bucket_id,name,owner_id) values
 ('documents','personal/00000000-0000-0000-0000-000000000003/regression.pdf',auth.uid()::text);
select pg_temp.verify((select count(*)=1 from storage.objects where name like '%/regression.pdf'),
  'modern owner_id-only uploads are readable by their uploader');
insert into public.documents(entity_id,profile_id,document_type_id,title,file_path)
  values((select id from public.entities where is_primary),auth.uid(),
    (select id from public.document_types where key='drivers_license'),'Own credential',
    'personal/00000000-0000-0000-0000-000000000003/regression.pdf');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update public.profiles set role='auditor' where id='00000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ declare affected int; begin
  update storage.objects set metadata='{"bad":true}' where name like '%regression%';
  get diagnostics affected=row_count;
  perform pg_temp.verify(affected=0,'demoted auditors cannot update owned storage objects');
  delete from storage.objects where name like '%regression%';
  get diagnostics affected=row_count;
  perform pg_temp.verify(affected=0,'demoted auditors cannot delete owned storage objects');
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin
  begin
    insert into public.documents(entity_id,document_type_id,title,file_path) values
      ((select id from public.entities where is_primary),
       (select id from public.document_types where key='other'),'Stolen reference',
       'personal/00000000-0000-0000-0000-000000000002/background-check.pdf');
    raise exception 'FAIL: attached another user file';
  exception when others then
    if sqlerrm not like 'Upload a file you are allowed%' then raise; end if;
  end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update public.vehicles set current_odometer=10000 where id='22222222-0000-0000-0000-000000000001';
insert into public.maintenance_schedules(vehicle_id,maintenance_type_id,interval_miles,last_service_odometer)
  values('22222222-0000-0000-0000-000000000001',
    (select id from public.maintenance_types where key='oil_change'),5000,0);
select pg_temp.verify((select is_due from public.v_maintenance_due),'old service baseline is due');
insert into public.maintenance_records(vehicle_id,entity_id,maintenance_type_id,service_date,odometer_at_service)
  values('22222222-0000-0000-0000-000000000001',(select id from public.entities where is_primary),
    (select id from public.maintenance_types where key='oil_change'),current_date,10000);
select pg_temp.verify((select not is_due and next_due_odometer=15000 from public.v_maintenance_due),
  'logging service advances the derived maintenance threshold');
delete from public.maintenance_records;
select pg_temp.verify((select is_due from public.v_maintenance_due),'deleting service restores the previous baseline');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
insert into public.trips(entity_id,vehicle_id,category_id,trip_date,distance_source,odometer_start,odometer_end,distance_miles,destination)
  values((select id from public.entities where is_primary),'22222222-0000-0000-0000-000000000001',
    (select id from public.trip_categories where name='Business'),'2026-07-01','odometer',100,110,999,'integrity odometer test');
select pg_temp.verify((select distance_miles=10 and deduction_amount=7 from public.v_trip_details
  where destination='integrity odometer test'),'server derives odometer distance and deduction');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.request_user_access('00000000-0000-0000-0000-000000000003',false);
select pg_temp.verify((select desired_active=false and synced_revision<revision from public.auth_access_sync
  where profile_id='00000000-0000-0000-0000-000000000003'),'deactivation queues durable Auth work');
select public.retry_user_access_sync('00000000-0000-0000-0000-000000000003');
select pg_temp.verify((select not p.is_active and not s.desired_active from public.profiles p
  join public.auth_access_sync s on s.profile_id=p.id where p.id='00000000-0000-0000-0000-000000000003'),
  'retry reads current database status without replaying client account fields');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.verify((select count(*)=0 from public.trips),'access is blocked before Auth synchronization');
do $$ begin
  begin
    perform public.claim_access_sync('00000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: ordinary user claimed privileged Auth work';
  exception when insufficient_privilege then null; end;
  begin
    perform public.retry_user_access_sync('00000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: ordinary user retried account management';
  exception when others then
    if sqlerrm not like 'Only an active owner%' then raise; end if;
  end;
end $$;
reset role;
set local role service_role;
do $$ declare job record; begin
  select * into job from public.claim_access_sync('00000000-0000-0000-0000-000000000003');
  perform pg_temp.verify(job.desired_active=false,'service worker claims the requested restriction');
  perform pg_temp.verify(not public.finish_access_sync(job.profile_id,job.lease_id,job.revision,'Auth unavailable'),
    'Auth failure leaves durable work pending');
  select * into job from public.claim_access_sync('00000000-0000-0000-0000-000000000003');
  perform pg_temp.verify(public.finish_access_sync(job.profile_id,job.lease_id,job.revision,null),
    'Auth synchronization can be retried successfully');
end $$;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update storage.objects set metadata='{"checked":true}' where name like '%/bylaws.pdf';
select pg_temp.verify((select metadata->>'checked'='true' from storage.objects where name like '%/bylaws.pdf'),
  'allowed storage metadata updates preserve file identity');
do $$ begin
  begin
    update storage.objects set name='renamed.pdf' where name like '%/bylaws.pdf';
    raise exception 'FAIL: file rename bypassed its reference';
  exception when insufficient_privilege then null; end;
end $$;
with removed as (delete from storage.objects where name like '%/bylaws.pdf' returning id)
select pg_temp.verify((select count(*)=0 from removed),'linked files cannot be deleted before removing their reference');
update public.documents set file_path=null where id='33333333-0000-0000-0000-000000000001';
with removed as (delete from storage.objects where name like '%/bylaws.pdf' returning id)
select pg_temp.verify((select count(*)=1 from removed),'unlinked files can be cleaned up through the storage API');
rollback;
\echo INTEGRITY_COMPLETE
