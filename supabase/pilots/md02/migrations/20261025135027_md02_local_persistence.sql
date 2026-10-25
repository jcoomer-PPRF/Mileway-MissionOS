-- MD02 A: opt-in LOCAL FICTIONAL pilot, deliberately outside normal migrations.
-- No public RPCs, no frontend routes, no automatic grants from fleet roles.
do $$ begin
  if current_database() !~ '^missionos_md02_[a-z0-9_]+_test$'
     or current_setting('missionos.md02_disposable', true) is distinct from 'fictional-training-only'
     or inet_server_addr() is not null then
    raise exception 'MD02_DISPOSABLE_LOCAL_TARGET_REQUIRED';
  end if;
end $$;
create schema md02;
revoke all on schema md02 from public, anon, authenticated, service_role;
alter default privileges in schema md02 revoke execute on functions from public, anon, authenticated, service_role;

create table md02.scope (
 id uuid primary key, organization_id uuid not null, entity_id uuid not null, program_id uuid not null,
 label text not null check (label like 'TRAINING %'), observer_enabled boolean not null default false,
 unique(organization_id,entity_id,program_id)
);
create table md02.membership (
 scope_id uuid not null references md02.scope, actor_id uuid not null references public.profiles,
 active boolean not null default true, author boolean not null default false,
 reviewer boolean not null default false, assignment_admin boolean not null default false,
 observer boolean not null default false, version bigint not null default 1 check(version>0),
 primary key(scope_id,actor_id)
);
create table md02.participant (
 scope_id uuid not null references md02.scope, id uuid not null, label text not null check(label like 'TRAINING %'),
 primary key(scope_id,id)
);
create table md02.goal_version (
 scope_id uuid not null, id uuid not null, participant_id uuid not null, body text not null,
 primary key(scope_id,id), unique(scope_id,id,participant_id),
 foreign key(scope_id,participant_id) references md02.participant(scope_id,id)
);
create table md02.template_version (
 id text primary key, definition jsonb not null
);
insert into md02.template_version values ('MD02-PE-1-v1',
 '{"fields":["subjective","objective","assessment","plan","intervention","response","goal_connection"],"required_for_submit":true,"max_characters":10000,"output":{"S":["subjective"],"O":["objective","intervention"],"A":["assessment","response","goal_connection"],"P":["plan"]}}');
create table md02.encounter (
 scope_id uuid not null references md02.scope, id uuid not null, participant_id uuid not null, goal_id uuid not null,
 service_date date not null, time_zone text not null, service_type text not null check(service_type='peer_support_training'),
 source_text text not null, known_source_gap boolean not null default false,
 primary key(scope_id,id),
 foreign key(scope_id,goal_id,participant_id) references md02.goal_version(scope_id,id,participant_id)
);
create table md02.assignment (
 scope_id uuid not null, encounter_id uuid not null, author_id uuid not null, reviewer_id uuid not null,
 active boolean not null default true, version bigint not null default 1 check(version>0),
 primary key(scope_id,encounter_id), check(author_id<>reviewer_id),
 foreign key(scope_id,encounter_id) references md02.encounter(scope_id,id),
 foreign key(scope_id,author_id) references md02.membership(scope_id,actor_id),
 foreign key(scope_id,reviewer_id) references md02.membership(scope_id,actor_id)
);
create table md02.assignment_history (
 scope_id uuid not null, encounter_id uuid not null, version bigint not null,
 author_id uuid not null, reviewer_id uuid not null, active boolean not null,
 actor_id uuid not null references public.profiles, changed_at timestamptz not null default clock_timestamp(),
 primary key(scope_id,encounter_id,version),
 foreign key(scope_id,encounter_id) references md02.encounter(scope_id,id)
);
create table md02.note (
 scope_id uuid not null, id uuid not null default gen_random_uuid(), encounter_id uuid not null,
 original_author_id uuid not null, parent_id uuid, correction_reason text,
 template_id text not null default 'MD02-PE-1-v1' references md02.template_version,
 state text not null default 'draft' check(state in ('draft','in_review','returned','reviewed')),
 fields jsonb not null default '{"subjective":"","objective":"","assessment":"","plan":"","intervention":"","response":"","goal_connection":""}',
 context jsonb not null, row_version bigint not null default 1 check(row_version>0),
 content_version bigint not null default 1 check(content_version>0),
 checked_content_version bigint, checked_by uuid, latest_revision integer not null default 0 check(latest_revision>=0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 primary key(scope_id,id),
 foreign key(scope_id,encounter_id) references md02.encounter(scope_id,id),
 foreign key(scope_id,original_author_id) references md02.membership(scope_id,actor_id),
 foreign key(scope_id,parent_id) references md02.note(scope_id,id),
 check((parent_id is null and correction_reason is null) or
       (parent_id is not null and length(btrim(correction_reason)) between 1 and 4000)),
 check((checked_content_version is null and checked_by is null) or
       (checked_content_version=content_version and checked_by is not null))
);
create unique index note_original_per_encounter on md02.note(scope_id,encounter_id) where parent_id is null;
create unique index note_one_active_correction on md02.note(scope_id,parent_id) where parent_id is not null and state<>'reviewed';
create index note_encounter on md02.note(scope_id,encounter_id);
create table md02.revision (
 scope_id uuid not null, note_id uuid not null, number integer not null check(number>0),
 submitted_by uuid not null references public.profiles, snapshot jsonb not null,
 submitted_at timestamptz not null default clock_timestamp(),
 primary key(scope_id,note_id,number), foreign key(scope_id,note_id) references md02.note(scope_id,id)
);
create table md02.review_action (
 scope_id uuid not null, note_id uuid not null, revision integer not null,
 actor_id uuid not null references public.profiles, action text not null check(action in ('return','accept')),
 reason text, reviewed_at timestamptz not null default clock_timestamp(),
 primary key(scope_id,note_id,revision),
 foreign key(scope_id,note_id,revision) references md02.revision(scope_id,note_id,number),
 check((action='return' and length(btrim(reason)) between 1 and 4000) or (action='accept' and reason is null))
);
create table md02.event (
 id bigint generated always as identity primary key, scope_id uuid not null references md02.scope,
 actor_id uuid not null references public.profiles, kind text not null,
 subject_actor_id uuid references public.profiles, subject_member_version bigint, subject_active boolean, assignment_version bigint,
 encounter_id uuid, note_id uuid, revision integer, request_id uuid, row_version bigint,
 occurred_at timestamptz not null default clock_timestamp(),
 foreign key(scope_id,encounter_id) references md02.encounter(scope_id,id),
 foreign key(scope_id,note_id) references md02.note(scope_id,id)
);
create index event_note on md02.event(scope_id,note_id,id);
create table md02.request_result (
 actor_id uuid not null references public.profiles, request_id uuid not null,
 scope_id uuid not null references md02.scope, fingerprint text not null, result jsonb not null,
 primary key(actor_id,request_id)
);

-- Immutable source/version/history records. No generic whole-row fleet audit.
create function md02.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'MD02_APPEND_ONLY'; end $$;
do $$ declare t text; begin
 foreach t in array array['participant','goal_version','template_version','encounter','assignment_history','revision','review_action','event','request_result'] loop
  execute format('create trigger immutable before update or delete on md02.%I for each row execute function md02.immutable()',t);
 end loop;
end $$;
create function md02.note_integrity() returns trigger language plpgsql set search_path='' as $$
begin
 if old.scope_id<>new.scope_id or old.id<>new.id or old.encounter_id<>new.encounter_id
 or old.original_author_id<>new.original_author_id or old.template_id<>new.template_id
 or old.parent_id is distinct from new.parent_id or old.correction_reason is distinct from new.correction_reason
 or old.created_at<>new.created_at or old.state='reviewed' then raise exception 'MD02_IMMUTABLE_IDENTITY_OR_REVIEW'; end if;
 if new.row_version<>old.row_version+1 then raise exception 'MD02_VERSION_REQUIRED'; end if;
 return new;
end $$;
create trigger note_integrity before update on md02.note for each row execute function md02.note_integrity();
create trigger note_no_delete before delete on md02.note for each row execute function md02.immutable();

-- Fail closed even if a future grant accidentally exposes a table. All normal
-- access uses explicitly authorized commands below. No write/read table grants.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='md02' loop
  execute format('alter table md02.%I enable row level security',t.tablename);
  execute format('revoke all on md02.%I from public,anon,authenticated,service_role',t.tablename);
 end loop;
end $$;
revoke all on all sequences in schema md02 from public,anon,authenticated,service_role;

-- Called only inside private SECURITY DEFINER entry points. Profiles are locked
-- before scope gates, so stored-account deactivation serializes with commands.
-- The per-scope gate deliberately serializes this small pilot's commands and
-- reads. This is a correctness choice; load/lock tuning belongs to hosted work.
create function md02.lock_actor(p_scope uuid) returns md02.membership
language plpgsql set search_path='' as $$
declare m md02.membership; u uuid:=auth.uid(); enabled boolean;
begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 select is_active into enabled from public.profiles where id=u for share;
 if enabled is distinct from true then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 if not exists(select from md02.membership where scope_id=p_scope and actor_id=u and active) then
  raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 perform 1 from md02.scope where id=p_scope for update;
 select * into m from md02.membership where scope_id=p_scope and actor_id=u and active;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 return m;
end $$;
create function md02.trim_space(p_text text) returns text language sql immutable set search_path='' as $$
 select btrim(p_text, chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(133)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279));
$$;
create function md02.valid_fields(p_fields jsonb, p_complete boolean) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or
  (select count(*) from jsonb_object_keys(p_fields))<>7 or
  p_fields-array['subjective','objective','assessment','plan','intervention','response','goal_connection']<>'{}'::jsonb then return false; end if;
 for k,v in select * from jsonb_each(p_fields) loop
  if jsonb_typeof(v)<>'string' or char_length(p_fields->>k)>10000 or
    (p_complete and length(md02.trim_space(p_fields->>k))=0) then return false; end if;
 end loop;
 return true;
end $$;

create function md02.command(p_scope uuid,p_encounter uuid,p_note uuid,p_request uuid,
 p_row_version bigint,p_assignment_version bigint,p_membership_version bigint,p_command text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); m md02.membership; a md02.assignment; e md02.encounter; n md02.note;
 prior md02.request_result; result jsonb; fingerprint text; allowed text[];
 target uuid:=p_note; revision_number integer; v_context jsonb; v_fields jsonb; reason text; changed boolean;
begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_request is null then raise exception 'VALIDATION_FAILED'; end if;
 -- Same actor/request replay is serialized even when an ID is misused across scopes.
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_request::text,0));
 m:=md02.lock_actor(p_scope);
 select * into a from md02.assignment where scope_id=p_scope and encounter_id=p_encounter;
 if not found or not a.active then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 if p_command in ('return_note','accept_note') then
  if not m.reviewer or a.reviewer_id<>u or a.author_id=u then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 else
  if not m.author or a.author_id<>u then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 end if;
 -- Authorization precedes replay: revoked/reassigned users cannot recover a prior result.
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_scope,p_encounter,p_note,p_row_version,
  p_assignment_version,p_membership_version,p_command,p_payload)::text,'UTF8')),'hex');
 select * into prior from md02.request_result where actor_id=u and request_id=p_request;
 if found then
  if prior.fingerprint<>fingerprint then raise exception 'REQUEST_ID_REUSED'; end if;
  return prior.result;
 end if;
 if p_assignment_version is null or p_membership_version is null or
    a.version<>p_assignment_version or m.version<>p_membership_version then raise exception 'VERSION_CONFLICT'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'VALIDATION_FAILED'; end if;
 allowed:=case p_command when 'create_note' then array[]::text[] when 'save_draft' then array['fields','metadata']
  when 'check_source' then array['content_version','attested'] when 'submit_note' then array[]::text[]
  when 'return_note' then array['revision','reason'] when 'accept_note' then array['revision']
  when 'start_correction' then array['reason'] else null end;
 if allowed is null or p_payload-allowed<>'{}'::jsonb then raise exception 'VALIDATION_FAILED'; end if;
 select * into e from md02.encounter where scope_id=p_scope and id=p_encounter;
 if p_command='create_note' then
  if p_note is not null or p_row_version is distinct from 0 then raise exception 'VALIDATION_FAILED'; end if;
  if exists(select from md02.note where scope_id=p_scope and encounter_id=p_encounter and parent_id is null) then raise exception 'INVALID_STATE'; end if;
  v_context:=jsonb_build_object('participant_id',e.participant_id,'participant_label',
   (select label from md02.participant where scope_id=p_scope and id=e.participant_id),
   'goal_id',e.goal_id,'goal',(select body from md02.goal_version where scope_id=p_scope and id=e.goal_id),
   'service_date',e.service_date,'time_zone',e.time_zone,'service_type',e.service_type,
   'source_text',e.source_text,'known_source_gap',e.known_source_gap);
  insert into md02.note(scope_id,encounter_id,original_author_id,context) values(p_scope,p_encounter,u,v_context) returning * into n;
  target:=n.id;
 else
  select * into n from md02.note where scope_id=p_scope and id=p_note and encounter_id=p_encounter for update;
  if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
  if n.row_version is distinct from p_row_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_command in ('save_draft','check_source','submit_note') and n.state not in ('draft','returned') then raise exception 'INVALID_STATE'; end if;
  if p_command in ('return_note','accept_note') and n.state<>'in_review' then raise exception 'INVALID_STATE'; end if;
  if p_command='save_draft' then
   if p_payload='{}' then raise exception 'VALIDATION_FAILED'; end if;
   v_fields:=coalesce(p_payload->'fields',n.fields); v_context:=n.context;
   if not md02.valid_fields(v_fields,false) then raise exception 'VALIDATION_FAILED'; end if;
   if p_payload ? 'metadata' then
    if jsonb_typeof(p_payload->'metadata')<>'object' or p_payload->'metadata'='{}' or
      (p_payload->'metadata')-array['service_date','time_zone','service_type']<>'{}' then raise exception 'VALIDATION_FAILED'; end if;
    if exists(select from jsonb_each(p_payload->'metadata') where jsonb_typeof(value)<>'string') then raise exception 'VALIDATION_FAILED'; end if;
    v_context:=v_context||(p_payload->'metadata');
    if v_context->>'service_date' !~ '^\d{4}-\d{2}-\d{2}$' or (v_context->>'service_date')::date is null or
       v_context->>'service_type'<>'peer_support_training' or not exists(select from pg_timezone_names where name=v_context->>'time_zone') then raise exception 'VALIDATION_FAILED'; end if;
   end if;
   changed:=v_fields<>n.fields or v_context<>n.context;
   update md02.note set fields=v_fields,context=v_context,row_version=row_version+1,
    content_version=content_version+case when changed then 1 else 0 end,
    checked_content_version=case when changed then null else checked_content_version end,
    checked_by=case when changed then null else checked_by end,updated_at=clock_timestamp()
    where scope_id=p_scope and id=p_note returning * into n;
  elsif p_command='check_source' then
   if p_payload->'attested' is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'content_version') is distinct from 'number' or
      (p_payload->>'content_version')::bigint is distinct from n.content_version or e.known_source_gap then raise exception 'VALIDATION_FAILED'; end if;
   update md02.note set checked_content_version=content_version,checked_by=u,row_version=row_version+1,updated_at=clock_timestamp()
    where scope_id=p_scope and id=p_note returning * into n;
  elsif p_command='submit_note' then
   if e.known_source_gap or not md02.valid_fields(n.fields,true) or n.checked_content_version is distinct from n.content_version or n.checked_by is distinct from u then raise exception 'VALIDATION_FAILED'; end if;
   revision_number:=n.latest_revision+1;
   insert into md02.revision(scope_id,note_id,number,submitted_by,snapshot)
    values(p_scope,n.id,revision_number,u,jsonb_build_object('fields',n.fields,'context',n.context,
     'template_id',n.template_id,'template',(select definition from md02.template_version where id=n.template_id),
     'original_author_id',n.original_author_id,'submitted_by',u,'content_version',n.content_version,
     'watermark','FICTIONAL TRAINING DATA — NOT A SERVICE RECORD — NOT SIGNED'));
   update md02.note set state='in_review',latest_revision=revision_number,row_version=row_version+1,updated_at=clock_timestamp()
    where scope_id=p_scope and id=p_note returning * into n;
  elsif p_command in ('return_note','accept_note') then
   if jsonb_typeof(p_payload->'revision') is distinct from 'number' or (p_payload->>'revision')::integer is distinct from n.latest_revision then raise exception 'VERSION_CONFLICT'; end if;
   if exists(select from md02.revision where scope_id=p_scope and note_id=n.id and number=n.latest_revision and submitted_by=u) then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
   reason:=p_payload->>'reason';
   if p_command='return_note' and (jsonb_typeof(p_payload->'reason') is distinct from 'string' or length(md02.trim_space(reason))=0 or length(reason)>4000) then raise exception 'VALIDATION_FAILED'; end if;
   insert into md02.review_action(scope_id,note_id,revision,actor_id,action,reason)
    values(p_scope,n.id,n.latest_revision,u,case p_command when 'return_note' then 'return' else 'accept' end,case when p_command='return_note' then md02.trim_space(reason) end);
   update md02.note set state=case p_command when 'return_note' then 'returned' else 'reviewed' end,
    checked_content_version=null,checked_by=null,row_version=row_version+1,updated_at=clock_timestamp()
    where scope_id=p_scope and id=p_note returning * into n;
  elsif p_command='start_correction' then
   reason:=p_payload->>'reason';
   if n.state<>'reviewed' then raise exception 'INVALID_STATE'; end if;
   if jsonb_typeof(p_payload->'reason') is distinct from 'string' or length(md02.trim_space(reason))=0 or length(reason)>4000 then raise exception 'VALIDATION_FAILED'; end if;
   if exists(select from md02.note where scope_id=p_scope and parent_id=n.id and state<>'reviewed') then raise exception 'INVALID_STATE'; end if;
   insert into md02.note(scope_id,encounter_id,original_author_id,parent_id,correction_reason,fields,context,template_id)
    values(p_scope,p_encounter,u,n.id,md02.trim_space(reason),n.fields,n.context,n.template_id) returning * into n;
   target:=n.id;
  end if;
 end if;
 result:=jsonb_build_object('note_id',target,'state',n.state,'row_version',n.row_version,'content_version',n.content_version,
   'revision',n.latest_revision,'assignment_version',a.version,'membership_version',m.version,'server_time',clock_timestamp());
 insert into md02.event(scope_id,actor_id,kind,encounter_id,note_id,revision,request_id,row_version)
  values(p_scope,u,p_command,p_encounter,target,nullif(n.latest_revision,0),p_request,n.row_version);
 insert into md02.request_result values(u,p_request,p_scope,fingerprint,result);
 return result;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
 raise exception 'VALIDATION_FAILED';
end $$;

create function md02.read_note(p_scope uuid,p_note uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m md02.membership; a md02.assignment; n md02.note; is_author boolean; result jsonb;
begin
 m:=md02.lock_actor(p_scope);
 select * into n from md02.note where scope_id=p_scope and id=p_note;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 select * into a from md02.assignment where scope_id=p_scope and encounter_id=n.encounter_id;
 is_author:=a.active and m.author and a.author_id=m.actor_id;
 if not coalesce(is_author,false) and not (a.active and m.reviewer and a.reviewer_id=m.actor_id and n.latest_revision>0)
    and not (m.observer and n.latest_revision>0 and (select observer_enabled from md02.scope where id=p_scope)) then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 result:=jsonb_build_object('note_id',n.id,'encounter_id',n.encounter_id,'state',n.state,'row_version',n.row_version,
  'content_version',n.content_version,'assignment_version',a.version,'membership_version',m.version,
  'original_author_id',n.original_author_id,'parent_id',n.parent_id,'correction_reason',n.correction_reason,
  'draft',case when is_author then jsonb_build_object('fields',n.fields,'context',n.context,'checked',n.checked_content_version=n.content_version and n.checked_by=m.actor_id) end,
  'revisions',coalesce((select jsonb_agg(to_jsonb(r)-'scope_id' order by number) from md02.revision r where scope_id=p_scope and note_id=n.id),'[]'),
  'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'scope_id' order by revision) from md02.review_action r where scope_id=p_scope and note_id=n.id),'[]'));
 insert into md02.event(scope_id,actor_id,kind,encounter_id,note_id,revision,row_version)
  values(p_scope,m.actor_id,'read_note',n.encounter_id,n.id,nullif(n.latest_revision,0),n.row_version);
 return result;
end $$;

-- Administrative surface changes existing scope/assignments only. It cannot
-- grant capabilities, grant oneself access, seed identities or read prose.
create function md02.set_assignment(p_scope uuid,p_encounter uuid,p_version bigint,p_member_version bigint,p_author uuid,p_reviewer uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m md02.membership; a md02.assignment;
begin
 m:=md02.lock_actor(p_scope);
 if not m.assignment_admin or m.actor_id in (p_author,p_reviewer) then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 select * into a from md02.assignment where scope_id=p_scope and encounter_id=p_encounter;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 if m.version is distinct from p_member_version or a.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 if p_active is null or p_author=p_reviewer or
  not exists(select from md02.membership where scope_id=p_scope and actor_id=p_author and active and author) or
  not exists(select from md02.membership where scope_id=p_scope and actor_id=p_reviewer and active and reviewer) then raise exception 'VALIDATION_FAILED'; end if;
 update md02.assignment set author_id=p_author,reviewer_id=p_reviewer,active=p_active,version=version+1
  where scope_id=p_scope and encounter_id=p_encounter returning * into a;
 insert into md02.assignment_history values(p_scope,p_encounter,a.version,p_author,p_reviewer,p_active,m.actor_id,clock_timestamp());
 update md02.note set checked_content_version=null,checked_by=null,row_version=row_version+1,updated_at=clock_timestamp()
  where scope_id=p_scope and encounter_id=p_encounter and state in ('draft','returned');
 insert into md02.event(scope_id,actor_id,kind,encounter_id,assignment_version) values(p_scope,m.actor_id,'assignment_changed',p_encounter,a.version);
 return jsonb_build_object('encounter_id',p_encounter,'version',a.version,'author_id',p_author,'reviewer_id',p_reviewer,'active',p_active);
end $$;
create function md02.set_member_active(p_scope uuid,p_target uuid,p_active boolean,p_version bigint,p_admin_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m md02.membership; target md02.membership;
begin
 m:=md02.lock_actor(p_scope);
 if not m.assignment_admin or m.actor_id=p_target then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 select * into target from md02.membership where scope_id=p_scope and actor_id=p_target;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 if p_active is null then raise exception 'VALIDATION_FAILED'; end if;
 if target.version is distinct from p_version or m.version is distinct from p_admin_version then raise exception 'VERSION_CONFLICT'; end if;
 update md02.membership set active=p_active,version=version+1 where scope_id=p_scope and actor_id=p_target returning * into target;
 insert into md02.event(scope_id,actor_id,kind,subject_actor_id,subject_member_version,subject_active) values(p_scope,m.actor_id,'membership_status_changed',p_target,target.version,target.active);
 return jsonb_build_object('actor_id',p_target,'active',target.active,'version',target.version);
end $$;

-- Default grants inherited from hosted public migrations cannot expose these.
revoke all on all functions in schema md02 from public,anon,authenticated,service_role;
grant usage on schema md02 to authenticated;
grant execute on function md02.command(uuid,uuid,uuid,uuid,bigint,bigint,bigint,text,jsonb),
 md02.read_note(uuid,uuid),md02.set_assignment(uuid,uuid,bigint,bigint,uuid,uuid,boolean),
 md02.set_member_active(uuid,uuid,boolean,bigint,bigint) to authenticated;

-- My Day/administration metadata. Reviewers see no unsubmitted author prose.
create function md02.list_encounters(p_scope uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m md02.membership; result jsonb;
begin
 m:=md02.lock_actor(p_scope);
 select coalesce(jsonb_agg(jsonb_build_object('encounter_id',a.encounter_id,'assignment_version',a.version,
  'author_id',a.author_id,'reviewer_id',a.reviewer_id,'active',a.active,'membership_version',m.version,
  'author_context',case when m.author and a.author_id=m.actor_id and a.active then
   jsonb_build_object('participant_id',e.participant_id,'participant_label',p.label,'goal_id',e.goal_id,
    'goal',g.body,'source_text',e.source_text,'known_source_gap',e.known_source_gap,
    'service_date',e.service_date,'time_zone',e.time_zone,'service_type',e.service_type) end,
  'notes',coalesce((select jsonb_agg(jsonb_build_object('note_id',n.id,'state',n.state,'revision',n.latest_revision))
    from md02.note n where n.scope_id=p_scope and n.encounter_id=e.id
     and ((m.author and a.author_id=m.actor_id) or n.latest_revision>0)),'[]')) order by a.encounter_id),'[]') into result
 from md02.assignment a join md02.encounter e on e.scope_id=a.scope_id and e.id=a.encounter_id
 join md02.participant p on p.scope_id=e.scope_id and p.id=e.participant_id
 join md02.goal_version g on g.scope_id=e.scope_id and g.id=e.goal_id
 where a.scope_id=p_scope and (m.assignment_admin or (a.active and
  ((m.author and a.author_id=m.actor_id) or (m.reviewer and a.reviewer_id=m.actor_id) or
   (m.observer and (select observer_enabled from md02.scope where id=p_scope)))));
 insert into md02.event(scope_id,actor_id,kind) values(p_scope,m.actor_id,'list_encounters');
 return result;
end $$;
revoke all on function md02.list_encounters(uuid) from public,anon,authenticated,service_role;
grant execute on function md02.list_encounters(uuid) to authenticated;
