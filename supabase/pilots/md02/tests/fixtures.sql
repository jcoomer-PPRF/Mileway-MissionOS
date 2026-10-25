-- FICTIONAL TRAINING ONLY. New accounts; no clinical narratives or real names.
insert into public.user_invitations(email,role) select 'training-md02-'||i||'@example.invalid','contributor' from generate_series(101,112) i;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'training-md02-'||i||'@example.invalid' from generate_series(101,112) i;
insert into md02.scope values
 ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000031','TRAINING ALPHA SCOPE',false),
 ('20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000031','TRAINING SECOND ORGANIZATION',false),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000031','TRAINING SECOND ENTITY',false),
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000021','40000000-0000-0000-0000-000000000031','TRAINING SECOND PROGRAM',false);
insert into md02.membership(scope_id,actor_id,author,reviewer,assignment_admin,observer)
 select '10000000-0000-0000-0000-000000000001',id,
 right(id::text,3) in ('101','104','106'),right(id::text,3) in ('102','106'),right(id::text,3)='103',right(id::text,3)='105'
 from public.profiles where id::text like '%00000000010_' or id::text like '%00000000011_';
insert into md02.membership(scope_id,actor_id,author,reviewer)
 select id,'00000000-0000-0000-0000-000000000107',true,true from md02.scope where label<>'TRAINING ALPHA SCOPE';
insert into md02.participant values('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','TRAINING ALPHA'),
 ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','TRAINING BETA');
insert into md02.goal_version values
 ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','TRAINING goal placeholder ALPHA'),
 ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','TRAINING goal placeholder BETA');
insert into md02.encounter
 select '10000000-0000-0000-0000-000000000001',('70000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','2026-10-25','America/Indiana/Indianapolis','peer_support_training',
 'FICTIONAL TRAINING SOURCE: placeholder content for database tests only; no service occurred.',false from generate_series(1,20) i;
insert into md02.encounter values
 ('10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000099','50000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002',
 '2026-10-25','America/Indiana/Indianapolis','peer_support_training','FICTIONAL TRAINING BETA: source intentionally incomplete.',true);
insert into md02.assignment(scope_id,encounter_id,author_id,reviewer_id)
 select scope_id,id,'00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102' from md02.encounter;
insert into md02.assignment_history select scope_id,encounter_id,version,author_id,reviewer_id,active,
 '00000000-0000-0000-0000-000000000103',clock_timestamp() from md02.assignment;
