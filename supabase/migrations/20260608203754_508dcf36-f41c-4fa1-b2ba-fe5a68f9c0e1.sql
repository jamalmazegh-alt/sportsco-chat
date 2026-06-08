-- Track who processed / approved
ALTER TABLE public.data_export_requests
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS hard_delete boolean NOT NULL DEFAULT false;

-- Superadmin update policies (use existing has_super_admin helper)
DROP POLICY IF EXISTS deletion_super_update ON public.account_deletion_requests;
CREATE POLICY deletion_super_update ON public.account_deletion_requests
  FOR UPDATE TO authenticated
  USING (public.has_super_admin(auth.uid()))
  WITH CHECK (public.has_super_admin(auth.uid()));

DROP POLICY IF EXISTS export_super_update ON public.data_export_requests;
CREATE POLICY export_super_update ON public.data_export_requests
  FOR UPDATE TO authenticated
  USING (public.has_super_admin(auth.uid()))
  WITH CHECK (public.has_super_admin(auth.uid()));

-- Anonymization function. Erases PII while preserving aggregate history (matches, stats, etc.).
CREATE OR REPLACE FUNCTION public.privacy_anonymize_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profile PII
  UPDATE public.profiles SET
    first_name = 'Utilisateur',
    last_name = 'supprimé',
    full_name = 'Utilisateur supprimé',
    avatar_url = NULL,
    phone = NULL,
    bio = NULL,
    public_slug = NULL,
    profile_visibility = 'private',
    city = NULL,
    region = NULL,
    birth_date = NULL,
    looking_for_club = false
  WHERE id = _user_id;

  -- Player rows linked to this user account
  UPDATE public.players SET
    first_name = 'Joueur',
    last_name = 'supprimé',
    email = NULL,
    phone = NULL,
    photo_url = NULL,
    public_slug = NULL,
    public_profile_enabled = false,
    deleted_at = now()
  WHERE user_id = _user_id;

  -- Drop direct personal links
  DELETE FROM public.player_parents WHERE user_id = _user_id;
  DELETE FROM public.player_guardians WHERE guardian_user_id = _user_id;
  DELETE FROM public.follows WHERE follower_id = _user_id OR followed_user_id = _user_id;
  DELETE FROM public.notifications WHERE user_id = _user_id;
  DELETE FROM public.coach_profiles WHERE user_id = _user_id;
  DELETE FROM public.event_messages WHERE sender_user_id = _user_id;
  DELETE FROM public.wall_comments WHERE author_id = _user_id;
  DELETE FROM public.wall_posts WHERE author_id = _user_id;
  DELETE FROM public.reminders WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.privacy_anonymize_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.privacy_anonymize_user(uuid) TO service_role;