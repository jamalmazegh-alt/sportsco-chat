-- 1) Helper: is_team_staff
CREATE OR REPLACE FUNCTION public.is_team_staff(_team_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = _team_id
      AND tm.user_id = _user_id
      AND tm.role IN ('coach','dirigeant')
  )
  OR EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.club_members cm ON cm.club_id = t.club_id
    WHERE t.id = _team_id
      AND cm.user_id = _user_id
      AND cm.role IN ('admin','dirigeant')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_team_staff(uuid, uuid) TO authenticated;

-- 2) Extend CHECK constraints on wall_posts
ALTER TABLE public.wall_posts DROP CONSTRAINT IF EXISTS wall_posts_audience_type_check;
ALTER TABLE public.wall_posts ADD CONSTRAINT wall_posts_audience_type_check
  CHECK (audience_type = ANY (ARRAY['club'::text, 'team'::text, 'multi_team'::text, 'group'::text, 'team_staff'::text]));

ALTER TABLE public.wall_posts DROP CONSTRAINT IF EXISTS wall_posts_audience_shape_check;
ALTER TABLE public.wall_posts ADD CONSTRAINT wall_posts_audience_shape_check
  CHECK (
    (audience_type = 'club' AND audience_team_ids IS NULL AND audience_group_ids IS NULL)
    OR (audience_type = 'team' AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) = 1 AND audience_group_ids IS NULL)
    OR (audience_type = 'multi_team' AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) >= 2 AND audience_group_ids IS NULL)
    OR (audience_type = 'group' AND audience_team_ids IS NULL AND audience_group_ids IS NOT NULL AND cardinality(audience_group_ids) >= 1)
    OR (audience_type = 'team_staff' AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) = 1 AND audience_group_ids IS NULL)
  );

-- 3) Update SELECT policy to add team_staff branch
DROP POLICY IF EXISTS wall_posts_select ON public.wall_posts;
CREATE POLICY wall_posts_select ON public.wall_posts
  FOR SELECT
  USING (
    is_club_member(auth.uid(), club_id)
    AND (
      author_user_id = auth.uid()
      OR (
        audience_type NOT IN ('group','team_staff')
        AND user_in_wall_audience(auth.uid(), club_id, audience_team_ids)
      )
      OR (
        audience_type = 'group'
        AND (
          has_club_role(auth.uid(), club_id, 'admin'::app_role)
          OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
          OR EXISTS (
            SELECT 1
            FROM club_group_members cgm
            JOIN club_members cm ON cm.id = cgm.member_id
            WHERE cgm.group_id = ANY (wall_posts.audience_group_ids)
              AND cm.user_id = auth.uid()
          )
        )
      )
      OR (
        audience_type = 'team_staff'
        AND audience_team_ids IS NOT NULL
        AND cardinality(audience_team_ids) >= 1
        AND public.is_team_staff(audience_team_ids[1], auth.uid())
      )
    )
  );

-- 4) Update INSERT policy: for team_staff, author must be staff of the team
DROP POLICY IF EXISTS wall_posts_insert ON public.wall_posts;
CREATE POLICY wall_posts_insert ON public.wall_posts
  FOR INSERT
  WITH CHECK (
    author_user_id = auth.uid()
    AND is_club_member(auth.uid(), club_id)
    AND (
      audience_type <> 'team_staff'
      OR (
        audience_team_ids IS NOT NULL
        AND cardinality(audience_team_ids) = 1
        AND public.is_team_staff(audience_team_ids[1], auth.uid())
      )
    )
  );
