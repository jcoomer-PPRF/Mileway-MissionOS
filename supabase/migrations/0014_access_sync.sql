-- Commit access restrictions first; synchronize Auth through durable, retryable
-- work. An Auth outage must never reactivate a disabled database account.
create table public.auth_access_sync (
  profile_id uuid primary key references public.profiles(id),
  desired_active boolean not null,
  revision bigint not null default 1,
  synced_revision bigint not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.auth_access_sync enable row level security;
grant select on public.auth_access_sync to authenticated;
create policy access_sync_read on public.auth_access_sync for select to authenticated
  using (public.is_owner());
grant select, insert, update on public.auth_access_sync to service_role;

create or replace function public.tg_queue_access_sync()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into public.auth_access_sync(profile_id,desired_active) values(new.id,new.is_active)
    on conflict(profile_id) do update set desired_active=excluded.desired_active,
      revision=auth_access_sync.revision+1,last_error=null,updated_at=now();
  end if;
  return new;
end $$;
create trigger trg_queue_access_sync after update on public.profiles
  for each row execute function public.tg_queue_access_sync();

create or replace function public.request_user_access(p_id uuid,p_active boolean,p_fields jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.access_control_lock set revision=revision+1 where singleton;
  if not coalesce((select role='owner' and is_active from public.profiles where id=auth.uid()),false) then
    raise exception 'Only an active owner may change account access.';
  end if;
  if not exists(select 1 from public.profiles where id=p_id) then raise exception 'Account not found.'; end if;
  if p_active is null then raise exception 'Account status is required.'; end if;
  if jsonb_typeof(p_fields) <> 'object' or
     p_fields - array['role','default_entity_id','job_title_id','full_name'] <> '{}'::jsonb then
    raise exception 'Invalid account fields.';
  end if;
  update public.profiles set is_active=p_active,
    role=coalesce((p_fields->>'role')::public.user_role,role),
    default_entity_id=case when p_fields ? 'default_entity_id' then (p_fields->>'default_entity_id')::uuid else default_entity_id end,
    job_title_id=case when p_fields ? 'job_title_id' then (p_fields->>'job_title_id')::uuid else job_title_id end,
    full_name=case when p_fields ? 'full_name' then p_fields->>'full_name' else full_name end
  where id=p_id;
  insert into public.auth_access_sync(profile_id,desired_active) values(p_id,p_active)
    on conflict(profile_id) do update set desired_active=excluded.desired_active,
      revision=auth_access_sync.revision+1,last_error=null,updated_at=now();
  return p_id;
end $$;
revoke all on function public.request_user_access(uuid,boolean,jsonb) from public;
grant execute on function public.request_user_access(uuid,boolean,jsonb) to authenticated;

-- Retrying synchronization must never replay stale status from an owner's UI.
create or replace function public.retry_user_access_sync(p_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare active_status boolean;
begin
  update public.access_control_lock set revision=revision+1 where singleton;
  if not coalesce((select role='owner' and is_active from public.profiles where id=auth.uid()),false) then
    raise exception 'Only an active owner may retry account synchronization.';
  end if;
  select is_active into active_status from public.profiles where id=p_id;
  if not found then raise exception 'Account not found.'; end if;
  insert into public.auth_access_sync(profile_id,desired_active) values(p_id,active_status)
    on conflict(profile_id) do update set desired_active=excluded.desired_active,
      revision=auth_access_sync.revision+1,last_error=null,updated_at=now();
  return p_id;
end $$;
revoke all on function public.retry_user_access_sync(uuid) from public;
grant execute on function public.retry_user_access_sync(uuid) to authenticated;

create or replace function public.claim_access_sync(p_id uuid)
returns table(profile_id uuid,desired_active boolean,revision bigint,lease_id uuid)
language sql security definer set search_path = public, pg_temp as $$
  update public.auth_access_sync s set lease_id=gen_random_uuid(),
    lease_until=clock_timestamp()+interval '60 seconds'
  where s.profile_id=p_id and (s.lease_until is null or s.lease_until < clock_timestamp())
    and s.synced_revision < s.revision
  returning s.profile_id,s.desired_active,s.revision,s.lease_id;
$$;
create or replace function public.finish_access_sync(p_id uuid,p_lease uuid,p_revision bigint,p_error text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare complete boolean;
begin
  update public.auth_access_sync set
    synced_revision=case when p_error is null then greatest(synced_revision,p_revision) else synced_revision end,
    last_error=p_error,lease_id=null,lease_until=null,updated_at=now()
  where profile_id=p_id and lease_id=p_lease;
  if not found then return false; end if;
  select synced_revision=revision into complete from public.auth_access_sync where profile_id=p_id;
  return complete;
end $$;
revoke all on function public.claim_access_sync(uuid),public.finish_access_sync(uuid,uuid,bigint,text)
  from public,anon,authenticated;
grant execute on function public.claim_access_sync(uuid),public.finish_access_sync(uuid,uuid,bigint,text)
  to service_role;
