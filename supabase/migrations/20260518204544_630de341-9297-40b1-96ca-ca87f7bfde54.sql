
-- 1) Helpers RLS booléens — nécessaires aux policies, gardent authenticated
DO $$
DECLARE
  fn record;
  rls_helpers text[] := ARRAY[
    'has_club_role(uuid,uuid,app_role)',
    'is_club_member(uuid,uuid)',
    'is_team_coach(uuid,uuid)',
    'is_player_team_coach(uuid,uuid)',
    'can_respond_for_player(uuid,uuid)',
    'can_author_player_feedback(uuid,uuid)',
    'can_view_player_feedback(uuid,uuid)',
    'can_view_player_review(uuid,uuid)',
    'can_view_team(uuid,uuid)',
    'can_access_event_chat(uuid,uuid)',
    'can_view_player_media(uuid,uuid)',
    'has_super_admin(uuid)',
    'is_parent_of_player(uuid,uuid)',
    'player_is_minor(uuid)',
    'club_has_active_subscription(uuid)'
  ];
  user_rpcs text[] := ARRAY[
    'redeem_club_invite(text)',
    'redeem_member_invite(text)',
    'soft_delete_entity(text,uuid)',
    'restore_entity(text,uuid)',
    'log_superadmin_action(text,text,uuid,uuid,jsonb,text,text)',
    'get_member_invite_info(text)',
    'get_platform_stats()'
  ];
  anon_rpcs text[] := ARRAY[
    'get_convocation_by_token(text)',
    'respond_via_token(text,attendance_status,text)',
    'email_exists(text)'
  ];
  internal_fns text[] := ARRAY[
    'handle_new_user()',
    'prevent_past_convocation_changes()',
    'enqueue_email(text,jsonb)',
    'delete_email(text,bigint)',
    'read_email_batch(text,integer,integer)',
    'move_to_dlq(text,text,bigint,jsonb)',
    'enforce_active_subscription_on_event()',
    'update_updated_at_column()',
    'purge_soft_deleted()',
    'create_trial_subscription_for_new_club()'
  ];
  s text;
BEGIN
  -- Tout révoquer puis ré-accorder
  FOREACH s IN ARRAY rls_helpers || user_rpcs || anon_rpcs || internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', s);
  END LOOP;

  FOREACH s IN ARRAY rls_helpers LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', s);
  END LOOP;

  FOREACH s IN ARRAY user_rpcs LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', s);
  END LOOP;

  FOREACH s IN ARRAY anon_rpcs LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', s);
  END LOOP;
  -- internal_fns : service_role conserve l'accès via son bypass; rien à accorder
END $$;
