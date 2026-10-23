-- Hosted Supabase grants EXECUTE to anon/authenticated directly by default.
-- Revoking PUBLIC alone does not revoke those explicit inherited grants.
-- Restrict only MissionOS functions; leave extension and platform functions alone.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature, p.prorettype = 'trigger'::regtype as is_trigger,
      p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array[
      'attach_audit','can_edit_all','can_manage_document_file','can_read_document_file',
      'can_read_financials','can_write','claim_access_sync','current_user_role',
      'earth_distance_m','file_identity_matches','file_is_unreferenced',
      'find_location_for_point','finish_access_sync','handle_new_user','is_active_user',
      'is_admin','is_owner','request_user_access','retry_user_access_sync',
      'tg_lock_profile_access','tg_maintenance_record_entity','tg_protect_profile_role',
      'tg_queue_access_sync','tg_set_audit_fields','tg_trip_distance',
      'tg_validate_document_file','tg_write_audit'
    ])
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
    execute format('alter function %s set search_path = public, pg_temp', fn.signature);
    if fn.is_trigger or fn.proname = 'attach_audit' then
      -- Triggers keep working: EXECUTE is checked when the trigger is created.
      execute format('revoke all on function %s from authenticated', fn.signature);
    end if;
  end loop;
end $$;
