-- 1. Add search_path to the 4 pgmq wrapper functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq, pg_temp
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$$;

-- 2. Revoke anon EXECUTE on internal SECURITY DEFINER functions
-- (RLS-helpers, triggers, admin functions). These are still callable as
-- SECURITY DEFINER from within RLS / authenticated contexts.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_past_convocation_changes() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_team_coach(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_club_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_club_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_respond_for_player(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_team(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_event_chat(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.player_is_minor(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enforce_active_subscription_on_event() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_parent_of_player(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_super_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_player_media(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_trial_subscription_for_new_club() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.club_has_active_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_superadmin_action(text, text, uuid, uuid, jsonb, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_platform_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.email_exists(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.soft_delete_entity(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_entity(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.purge_soft_deleted() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, public;

-- NOTE: Public token-based functions kept executable by anon:
-- get_member_invite_info, get_convocation_by_token, respond_via_token,
-- redeem_club_invite, redeem_member_invite — these power magic-link flows.