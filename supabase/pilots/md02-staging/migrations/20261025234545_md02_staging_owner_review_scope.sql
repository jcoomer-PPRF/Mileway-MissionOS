-- Owner review data is separate from automated test encounters; no reset/delete.
do $$begin if obj_description('md02'::regnamespace,'pg_namespace') not like '%bgvhqsfpjanmqixtmdtl%' then raise exception 'MD02_STAGING_TARGET_REQUIRED';end if;end $$;
insert into md02.scope values('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000011','90000000-0000-0000-0000-000000000021','90000000-0000-0000-0000-000000000031','TRAINING HOSTED OWNER REVIEW',false);
insert into md02.membership(scope_id,actor_id,active,author,reviewer,assignment_admin,observer) values
('90000000-0000-0000-0000-000000000001','4248f200-a441-49b7-9ad8-3323d6250b05',true,true,false,false,false),
('90000000-0000-0000-0000-000000000001','58ff52fe-9fae-40a1-a9c2-c11cf78410b3',true,false,true,false,false),
('90000000-0000-0000-0000-000000000001','50c590f7-4c8f-4c39-b2f1-2c89f51bc315',true,false,false,true,false),
('90000000-0000-0000-0000-000000000001','fe72229d-f478-463d-94ff-4e56a43b7c6e',true,false,false,false,true),
('90000000-0000-0000-0000-000000000001','ab231b51-5a28-4dc0-a7c2-98966cdca0c3',true,false,false,false,false);
insert into md02.participant values('90000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','TRAINING ALPHA'),
 ('90000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','TRAINING BETA');
insert into md02.goal_version values
 ('90000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','TRAINING goal placeholder ALPHA'),
 ('90000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','TRAINING goal placeholder BETA');
insert into md02.encounter
 select '90000000-0000-0000-0000-000000000001',('70000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','2026-10-25','America/Indiana/Indianapolis','peer_support_training',
 'FICTIONAL TRAINING SOURCE: placeholder content for database tests only; no service occurred.',false from generate_series(1,1) i;
insert into md02.encounter values
 ('90000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000099','50000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002',
 '2026-10-25','America/Indiana/Indianapolis','peer_support_training','FICTIONAL TRAINING BETA: source intentionally incomplete.',true);
insert into md02.assignment(scope_id,encounter_id,author_id,reviewer_id)
 select scope_id,id,'4248f200-a441-49b7-9ad8-3323d6250b05','58ff52fe-9fae-40a1-a9c2-c11cf78410b3' from md02.encounter where scope_id='90000000-0000-0000-0000-000000000001';
insert into md02.assignment_history select scope_id,encounter_id,version,author_id,reviewer_id,active,
 '50c590f7-4c8f-4c39-b2f1-2c89f51bc315',clock_timestamp() from md02.assignment where scope_id='90000000-0000-0000-0000-000000000001';
