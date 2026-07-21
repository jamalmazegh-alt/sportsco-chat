-- =====================================================================
-- Staff availabilities (Prompt 1) — global au coach, scellé au club
-- =====================================================================

CREATE TABLE public.staff_availabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL CHECK (reason IN ('vacation','injury','school','family','work','other')),
  comment text,
  certainty text NOT NULL DEFAULT 'confirmed' CHECK (certainty IN ('confirmed','tentative')),
  visibility text NOT NULL DEFAULT 'staff' CHECK (visibility IN ('staff','admins_only')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_staff_availabilities_user_dates
  ON public.staff_availabilities(user_id, start_date);
CREATE INDEX idx_staff_availabilities_dates
  ON public.staff_availabilities(start_date, end_date);
CREATE INDEX idx_staff_availabilities_status
  ON public.staff_availabilities(status);
CREATE INDEX idx_staff_availabilities_club
  ON public.staff_availabilities(club_id);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.staff_availabilities TO authenticated;
GRANT ALL ON public.staff_availabilities TO service_role;

-- RLS
ALTER TABLE public.staff_availabilities ENABLE ROW LEVEL SECURITY;

-- SELECT : owner OR club staff OR coach partageant une équipe (dans le même club)
CREATE POLICY "staff_availabilities_select"
ON public.staff_availabilities
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_club_staff(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1
    FROM public.team_members tm_self
    JOIN public.team_members tm_target
      ON tm_target.team_id = tm_self.team_id
     AND tm_target.role = 'coach'::public.app_role
    JOIN public.teams t
      ON t.id = tm_self.team_id
     AND t.club_id = staff_availabilities.club_id
    WHERE tm_self.user_id = auth.uid()
      AND tm_self.role = 'coach'::public.app_role
      AND tm_target.user_id = staff_availabilities.user_id
  )
);

-- INSERT : soit le coach lui-même (self), soit un admin du club
CREATE POLICY "staff_availabilities_insert"
ON public.staff_availabilities
FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND (
    user_id = auth.uid()
    OR public.is_club_staff(auth.uid(), club_id)
  )
);

-- UPDATE : l'auteur OU un admin du club (édition + annulation logique)
CREATE POLICY "staff_availabilities_update"
ON public.staff_availabilities
FOR UPDATE
TO authenticated
USING (
  created_by_user_id = auth.uid()
  OR public.is_club_staff(auth.uid(), club_id)
)
WITH CHECK (
  created_by_user_id = auth.uid()
  OR public.is_club_staff(auth.uid(), club_id)
);

-- updated_at trigger
CREATE TRIGGER trg_staff_availabilities_updated
BEFORE UPDATE ON public.staff_availabilities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Job de maintenance (comme mark_expired_availabilities_completed)
CREATE OR REPLACE FUNCTION public.mark_expired_staff_availabilities_completed()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.staff_availabilities
       SET status = 'completed'
     WHERE status = 'active' AND end_date < CURRENT_DATE
    RETURNING 1
  )
  SELECT COUNT(*)::int FROM updated;
$$;

GRANT EXECUTE ON FUNCTION public.mark_expired_staff_availabilities_completed() TO authenticated;

-- =====================================================================
-- Prompt 1 bis — Lecture sécurisée : SEUL point d'accès aux motifs
-- =====================================================================
-- Renvoie les indispos 'active' d'un coach pour le viewer courant, avec
-- reason/comment masqués selon la visibility et le rôle du viewer.
--   - admin du club                            → reason + comment
--   - coach partageant une équipe (même club)  → reason + comment SI visibility='staff'
--   - self                                     → tout
--   - sinon                                    → NULL / NULL
-- La fonction couvre les cas :
--   • un coach précis (p_user_id) sur une période
--   • toutes les indispos d'une équipe (p_team_id) sur une période
--
-- Note : les policies RLS restent fail-closed ; cette fonction est le
-- seul point d'accès recommandé côté front pour les indispos d'AUTRES coachs.

CREATE OR REPLACE FUNCTION public.get_staff_availabilities(
  p_team_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  club_id uuid,
  start_date date,
  end_date date,
  reason text,
  comment text,
  certainty text,
  visibility text,
  status text,
  can_view_reason boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
            AND tm.role = 'coach'::public.app_role
            AND t.club_id = sa.club_id
        )
      )
  ),
  scoped AS (
    SELECT
      c.*,
      -- viewer role vs cette ligne
      (c.user_id = (SELECT uid FROM viewer))                           AS is_self,
      public.is_club_staff((SELECT uid FROM viewer), c.club_id)        AS is_admin,
      EXISTS (
        SELECT 1
        FROM public.team_members tm_self
        JOIN public.team_members tm_target
          ON tm_target.team_id = tm_self.team_id
         AND tm_target.role = 'coach'::public.app_role
        JOIN public.teams t
          ON t.id = tm_self.team_id
         AND t.club_id = c.club_id
        WHERE tm_self.user_id = (SELECT uid FROM viewer)
          AND tm_self.role = 'coach'::public.app_role
          AND tm_target.user_id = c.user_id
      )                                                                 AS is_shared_coach
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
  -- fail-closed : ne renvoyer que si le viewer a un droit d'accès à la LIGNE
  WHERE s.is_self OR s.is_admin OR s.is_shared_coach;
$$;

REVOKE ALL ON FUNCTION public.get_staff_availabilities(uuid, uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_availabilities(uuid, uuid, uuid, date, date) TO authenticated;
