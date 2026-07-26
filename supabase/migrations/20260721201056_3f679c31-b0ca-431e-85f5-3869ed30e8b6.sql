
-- Lot 1-fix: include assistant_coach alongside coach for staff_availabilities visibility

DROP POLICY IF EXISTS staff_availabilities_select ON public.staff_availabilities;

CREATE POLICY staff_availabilities_select ON public.staff_availabilities
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_club_staff(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm_self
    JOIN public.team_members tm_target
      ON tm_target.team_id = tm_self.team_id
     AND tm_target.role::text IN ('coach','assistant_coach')
    JOIN public.teams t
      ON t.id = tm_self.team_id
     AND t.club_id = staff_availabilities.club_id
    WHERE tm_self.user_id = auth.uid()
      AND tm_self.role::text IN ('coach','assistant_coach')
      AND tm_target.user_id = staff_availabilities.user_id
  )
);

CREATE OR REPLACE FUNCTION public.get_staff_availabilities(
  p_team_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE(
  id uuid, user_id uuid, club_id uuid, start_date date, end_date date,
  reason text, comment text, certainty text, visibility text, status text,
  can_view_reason boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH viewer AS (
    SELECT auth.uid() AS uid
  ),
  candidate AS (
    SELECT sa.*
    FROM public.staff_availabilities sa
    WHERE sa.status = 'active'
      AND (p_user_id IS NULL OR sa.user_id = p_user_id)
      AND (p_club_id IS NULL OR sa.club_id = p_club_id)
      AND (p_start IS NULL OR sa.end_date   >= p_start)
      AND (p_end   IS NULL OR sa.start_date <= p_end)
      AND (
        p_team_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          JOIN public.teams t ON t.id = tm.team_id
          WHERE tm.team_id = p_team_id
            AND tm.user_id = sa.user_id
            AND tm.role::text IN ('coach','assistant_coach')
            AND t.club_id = sa.club_id
        )
      )
  ),
  scoped AS (
    SELECT
      c.*,
      (c.user_id = (SELECT uid FROM viewer)) AS is_self,
      public.is_club_staff((SELECT uid FROM viewer), c.club_id) AS is_admin,
      EXISTS (
        SELECT 1
        FROM public.team_members tm_self
        JOIN public.team_members tm_target
          ON tm_target.team_id = tm_self.team_id
         AND tm_target.role::text IN ('coach','assistant_coach')
        JOIN public.teams t
          ON t.id = tm_self.team_id
         AND t.club_id = c.club_id
        WHERE tm_self.user_id = (SELECT uid FROM viewer)
          AND tm_self.role::text IN ('coach','assistant_coach')
          AND tm_target.user_id = c.user_id
      ) AS is_shared_coach
    FROM candidate c
  )
  SELECT
    s.id,
    s.user_id,
    s.club_id,
    s.start_date,
    s.end_date,
    CASE
      WHEN s.is_self OR s.is_admin THEN s.reason
      WHEN s.is_shared_coach AND s.visibility = 'staff' THEN s.reason
      ELSE NULL
    END AS reason,
    CASE
      WHEN s.is_self OR s.is_admin THEN s.comment
      WHEN s.is_shared_coach AND s.visibility = 'staff' THEN s.comment
      ELSE NULL
    END AS comment,
    s.certainty,
    s.visibility,
    s.status,
    (s.is_self OR s.is_admin OR (s.is_shared_coach AND s.visibility = 'staff')) AS can_view_reason
  FROM scoped s
  WHERE s.is_self OR s.is_admin OR s.is_shared_coach;
$function$;
