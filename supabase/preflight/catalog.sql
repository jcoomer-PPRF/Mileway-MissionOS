-- Run first as an operator, before choosing fresh installation vs. upgrade.
-- Read-only, aggregate metadata only: no emails, tokens, paths, or file contents.
begin read only;
set local statement_timeout = '30s';

select jsonb_build_object(
  'checked_at', now(),
  'database_version', current_setting('server_version'),
  'migration_history_present', to_regclass('supabase_migrations.schema_migrations') is not null,
  'auth_user_count', (select count(*) from auth.users),
  'public_tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', c.relname, 'rls', c.relrowsecurity
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ), '[]'::jsonb),
  'user_roles', coalesce((
    select jsonb_agg(e.enumlabel order by e.enumsortorder)
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ), '[]'::jsonb),
  'buckets', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'public', public) order by id)
    from storage.buckets
  ), '[]'::jsonb),
  'stored_objects', (select count(*) from storage.objects)
) as preflight_catalog;

rollback;
