-- MD02 A: opt-in LOCAL FICTIONAL pilot, deliberately outside normal migrations.
-- No public RPCs, no frontend routes, no automatic grants from fleet roles.
do $$ begin
  if current_database() !~ '^missionos_md02_[a-z0-9_]+_test$'
     or current_setting('missionos.md02_disposable', true) is distinct from 'fictional-training-only'
     or inet_server_addr() is not null then
    raise exception 'MD02_DISPOSABLE_LOCAL_TARGET_REQUIRED';
  end if;
end $$;

-- C adds exact-revision outputs and explicit read capabilities.
create or replace function md02.read_note(p_scope uuid,p_note uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m md02.membership; a md02.assignment; n md02.note; is_author boolean; result jsonb;
begin
 m:=md02.lock_actor(p_scope);
 select * into n from md02.note where scope_id=p_scope and id=p_note;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 select * into a from md02.assignment where scope_id=p_scope and encounter_id=n.encounter_id;
 is_author:=a.active and m.author and a.author_id=m.actor_id;
 if not coalesce(is_author,false) and not (a.active and m.reviewer and a.reviewer_id=m.actor_id and n.latest_revision>0)
    and not (a.active and m.observer and n.latest_revision>0 and (select observer_enabled from md02.scope where id=p_scope)) then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 result:=jsonb_build_object('note_id',n.id,'encounter_id',n.encounter_id,'state',n.state,'row_version',n.row_version,
  'content_version',n.content_version,'assignment_version',a.version,'membership_version',m.version,
  'access',jsonb_build_object('observer',not is_author and not (m.reviewer and a.reviewer_id=m.actor_id), 'can_review',a.active and m.reviewer and a.reviewer_id=m.actor_id and a.author_id<>m.actor_id and not exists(select from md02.revision where scope_id=p_scope and note_id=n.id and number=n.latest_revision and submitted_by=m.actor_id), 'can_correct',is_author, 'can_export',is_author or (a.active and m.reviewer and a.reviewer_id=m.actor_id)),
  'original_author_id',n.original_author_id,'parent_id',n.parent_id,'correction_reason',n.correction_reason,
  'draft',case when is_author then jsonb_build_object('fields',n.fields,'context',n.context,'checked',n.checked_content_version=n.content_version and n.checked_by=m.actor_id) end,
  'revisions',coalesce((select jsonb_agg(to_jsonb(r)-'scope_id' order by number) from md02.revision r where scope_id=p_scope and note_id=n.id),'[]'),
  'reviews',coalesce((select jsonb_agg(to_jsonb(r)-'scope_id' order by revision) from md02.review_action r where scope_id=p_scope and note_id=n.id),'[]'));
 insert into md02.event(scope_id,actor_id,kind,encounter_id,note_id,revision,row_version)
  values(p_scope,m.actor_id,'read_note',n.encounter_id,n.id,nullif(n.latest_revision,0),n.row_version);
 return result;
end $$;


create or replace function md02.list_encounters(p_scope uuid) returns jsonb
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
  'notes',coalesce((select jsonb_agg(jsonb_build_object('note_id',n.id,'state',n.state,'revision',n.latest_revision,'parent_id',n.parent_id) order by n.created_at,n.id)
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

create function md02.revision_output(p_scope uuid,p_note uuid,p_revision integer,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m md02.membership; a md02.assignment; n md02.note; r md02.revision; can_read boolean; can_export boolean; result jsonb;
begin
 m:=md02.lock_actor(p_scope);
 select * into n from md02.note where scope_id=p_scope and id=p_note;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 select * into a from md02.assignment where scope_id=p_scope and encounter_id=n.encounter_id;
 can_export:=a.active and ((m.author and a.author_id=m.actor_id) or (m.reviewer and a.reviewer_id=m.actor_id));
 can_read:=can_export or (a.active and m.observer and (select observer_enabled from md02.scope where id=p_scope));
 if not coalesce(can_read,false) or (p_mode='export' and not coalesce(can_export,false)) then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 if p_mode is null or p_mode not in ('preview','export') or p_revision is null or p_revision<1 then raise exception 'VALIDATION_FAILED'; end if;
 select * into r from md02.revision where scope_id=p_scope and note_id=p_note and number=p_revision;
 if not found then raise exception 'NOT_FOUND_OR_NOT_ALLOWED'; end if;
 result:=jsonb_build_object('note_id',n.id,'encounter_id',n.encounter_id,'revision',r.number,
  'submitted_at',r.submitted_at,'submitted_by',r.submitted_by,'original_author_id',n.original_author_id,
  'parent_id',n.parent_id,'correction_reason',n.correction_reason,'snapshot',r.snapshot,
  'review',(select jsonb_build_object('action',action,'reason',reason,'actor_id',actor_id,'reviewed_at',reviewed_at) from md02.review_action where scope_id=p_scope and note_id=p_note and revision=p_revision));
 insert into md02.event(scope_id,actor_id,kind,encounter_id,note_id,revision,row_version)
  values(p_scope,m.actor_id,p_mode,n.encounter_id,n.id,r.number,n.row_version);
 return result;
end $$;
revoke all on function md02.read_note(uuid,uuid),md02.revision_output(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function md02.read_note(uuid,uuid),md02.revision_output(uuid,uuid,integer,text) to authenticated;
