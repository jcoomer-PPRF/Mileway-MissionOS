-- Only new MD02 foreign keys; existing fleet optimization notices retained.
do $$begin if obj_description('md02'::regnamespace,'pg_namespace') not like '%bgvhqsfpjanmqixtmdtl%' then raise exception 'MD02_STAGING_TARGET_REQUIRED';end if;end $$;
create index "idx_assignment_history_actor_id" on md02."assignment_history"("actor_id");
create index "idx_assignment_scope_id_author_id" on md02."assignment"("scope_id","author_id");
create index "idx_assignment_scope_id_reviewer_id" on md02."assignment"("scope_id","reviewer_id");
create index "idx_encounter_scope_id_goal_id_participant_id" on md02."encounter"("scope_id","goal_id","participant_id");
create index "idx_event_actor_id" on md02."event"("actor_id");
create index "idx_event_scope_id_encounter_id" on md02."event"("scope_id","encounter_id");
create index "idx_event_subject_actor_id" on md02."event"("subject_actor_id");
create index "idx_goal_version_scope_id_participant_id" on md02."goal_version"("scope_id","participant_id");
create index "idx_membership_actor_id" on md02."membership"("actor_id");
create index "idx_note_scope_id_original_author_id" on md02."note"("scope_id","original_author_id");
create index "idx_note_template_id" on md02."note"("template_id");
create index "idx_request_result_scope_id" on md02."request_result"("scope_id");
create index "idx_review_action_actor_id" on md02."review_action"("actor_id");
create index "idx_revision_submitted_by" on md02."revision"("submitted_by");
