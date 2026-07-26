-- Align wall_posts_validate_audience trigger with is_team_staff (single source
-- of truth shared with the INSERT RLS policy). Preserve 'team_staff' audience_type
-- when the client set it (do not clobber to 'team' / 'multi_team').

CREATE OR REPLACE FUNCTION public.wall_posts_validate_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_priv boolean;
  _tid uuid;
  _gid uuid;
  _t_club uuid;
  _t_deleted timestamptz;
  _g_club uuid;
  _deduped uuid[];
  _deduped_g uuid[];
  _keep_staff boolean := (NEW.audience_type = 'team_staff');
BEGIN
  -- Dedupe team ids + null-on-empty.
  IF NEW.audience_team_ids IS NOT NULL THEN
    SELECT ARRAY(SELECT DISTINCT unnest(NEW.audience_team_ids)) INTO _deduped;
    IF _deduped IS NULL OR cardinality(_deduped) = 0 THEN
      NEW.audience_team_ids := NULL;
    ELSE
      NEW.audience_team_ids := _deduped;
    END IF;
  END IF;

  -- Dedupe group ids + null-on-empty.
  IF NEW.audience_group_ids IS NOT NULL THEN
    SELECT ARRAY(SELECT DISTINCT unnest(NEW.audience_group_ids)) INTO _deduped_g;
    IF _deduped_g IS NULL OR cardinality(_deduped_g) = 0 THEN
      NEW.audience_group_ids := NULL;
    ELSE
      NEW.audience_group_ids := _deduped_g;
    END IF;
  END IF;

  -- Groups and teams are mutually exclusive.
  IF NEW.audience_group_ids IS NOT NULL AND NEW.audience_team_ids IS NOT NULL THEN
    RAISE EXCEPTION 'wall_post audience: cannot mix teams and groups' USING ERRCODE = '22023';
  END IF;

  -- Compute discriminant (never trust the client), but keep 'team_staff' if set.
  IF _keep_staff THEN
    IF NEW.audience_team_ids IS NULL OR cardinality(NEW.audience_team_ids) = 0 THEN
      RAISE EXCEPTION 'wall_post audience: team_staff requires at least one team' USING ERRCODE = '22023';
    END IF;
    NEW.audience_type := 'team_staff';
  ELSIF NEW.audience_group_ids IS NOT NULL THEN
    NEW.audience_type := 'group';
  ELSIF NEW.audience_team_ids IS NULL THEN
    NEW.audience_type := 'club';
  ELSIF cardinality(NEW.audience_team_ids) = 1 THEN
    NEW.audience_type := 'team';
  ELSE
    NEW.audience_type := 'multi_team';
  END IF;

  -- Authorization: admins/dirigeants can always target anything in their club.
  _is_priv := public.has_club_role(_uid, NEW.club_id, 'admin')
           OR public.has_club_role(_uid, NEW.club_id, 'dirigeant');

  IF NEW.audience_team_ids IS NOT NULL THEN
    FOREACH _tid IN ARRAY NEW.audience_team_ids LOOP
      SELECT t.club_id, t.deleted_at INTO _t_club, _t_deleted
      FROM public.teams t WHERE t.id = _tid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'wall_post audience: team % not found', _tid USING ERRCODE = '22023';
      END IF;
      IF _t_club <> NEW.club_id THEN
        RAISE EXCEPTION 'wall_post audience: team % is not in club %', _tid, NEW.club_id USING ERRCODE = '22023';
      END IF;
      IF _t_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'wall_post audience: team % is deleted', _tid USING ERRCODE = '22023';
      END IF;
      -- Aligned with the INSERT RLS policy: is_team_staff is the single
      -- source of truth for "authorised to post for this team".
      IF NOT _is_priv AND NOT public.is_team_staff(_tid, _uid) THEN
        RAISE EXCEPTION 'wall_post audience: user % cannot target team %', _uid, _tid USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  -- Validate groups: must belong to same club. Non-priv authorship of the group
  -- is enforced upstream by RLS/UI (targetableGroups). Here we only guard cross-club.
  IF NEW.audience_group_ids IS NOT NULL THEN
    FOREACH _gid IN ARRAY NEW.audience_group_ids LOOP
      SELECT g.club_id INTO _g_club FROM public.club_groups g WHERE g.id = _gid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'wall_post audience: group % not found', _gid USING ERRCODE = '22023';
      END IF;
      IF _g_club <> NEW.club_id THEN
        RAISE EXCEPTION 'wall_post audience: group % is not in club %', _gid, NEW.club_id USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
