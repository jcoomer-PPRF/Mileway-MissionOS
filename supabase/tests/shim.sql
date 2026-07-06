-- Minimal Supabase-environment shim for verifying Mileway migrations on plain
-- Postgres. Recreates only what the migrations reference: the auth schema
-- (users + uid()), the storage schema (buckets + objects with RLS), and the
-- Supabase database roles. auth.uid() reads the same JWT-claim GUC Supabase
-- uses, so tests can impersonate a user via set_config().
--
-- Fidelity limits: real Supabase Auth (login, tokens, bans) and the Storage
-- API are not simulated — table/RLS behavior is exact, auth/storage plumbing
-- is approximated. The cloud runbook (MILEWAY_MIGRATION_RUNBOOK.md) covers
-- those layers.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant authenticated, anon, service_role to current_user;

-- auth schema -----------------------------------------------------------------
create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- storage schema ----------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

grant usage on schema storage to authenticated, anon;
grant select on storage.buckets to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated;
