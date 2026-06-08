CREATE OR REPLACE FUNCTION public.privacy_anonymize_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

  DELETE FROM public.player_parents WHERE parent_user_id = _user_id;
  DELETE FROM public.player_guardians WHERE user_id = _user_id;
  DELETE FROM public.follows WHERE follower_id = _user_id;
  DELETE FROM public.notifications WHERE user_id = _user_id;
  DELETE FROM public.coach_profiles WHERE user_id = _user_id;
  DELETE FROM public.event_messages WHERE sender_user_id = _user_id;
  DELETE FROM public.wall_comments WHERE author_id = _user_id;
  DELETE FROM public.wall_posts WHERE author_id = _user_id;
  DELETE FROM public.reminders WHERE user_id = _user_id;
END;
$$;