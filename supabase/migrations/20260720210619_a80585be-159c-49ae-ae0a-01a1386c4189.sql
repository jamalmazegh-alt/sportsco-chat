-- Colonnes: audience_group_ids + send_email
ALTER TABLE public.wall_posts
  ADD COLUMN IF NOT EXISTS audience_group_ids uuid[],
  ADD COLUMN IF NOT EXISTS send_email boolean NOT NULL DEFAULT false;

-- Étendre l'enum d'audience
ALTER TABLE public.wall_posts DROP CONSTRAINT IF EXISTS wall_posts_audience_type_check;
ALTER TABLE public.wall_posts ADD CONSTRAINT wall_posts_audience_type_check
  CHECK (audience_type = ANY (ARRAY['club','team','multi_team','group']));

-- Forme cohérente group ⇒ group_ids non vide, team_ids null
ALTER TABLE public.wall_posts DROP CONSTRAINT IF EXISTS wall_posts_audience_shape_check;
ALTER TABLE public.wall_posts ADD CONSTRAINT wall_posts_audience_shape_check CHECK (
  (audience_type = 'club'
     AND audience_team_ids IS NULL
     AND audience_group_ids IS NULL)
  OR (audience_type = 'team'
     AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) = 1
     AND audience_group_ids IS NULL)
  OR (audience_type = 'multi_team'
     AND audience_team_ids IS NOT NULL AND cardinality(audience_team_ids) >= 2
     AND audience_group_ids IS NULL)
  OR (audience_type = 'group'
     AND audience_team_ids IS NULL
     AND audience_group_ids IS NOT NULL AND cardinality(audience_group_ids) >= 1)
);

-- La contrainte de cardinalité originale devient redondante avec la forme, mais on la laisse cohérente.
ALTER TABLE public.wall_posts DROP CONSTRAINT IF EXISTS wall_posts_audience_cardinality_check;
ALTER TABLE public.wall_posts ADD CONSTRAINT wall_posts_audience_cardinality_check
  CHECK (
    (audience_team_ids IS NULL OR cardinality(audience_team_ids) > 0)
    AND (audience_group_ids IS NULL OR cardinality(audience_group_ids) > 0)
  );

CREATE INDEX IF NOT EXISTS idx_wall_posts_audience_groups
  ON public.wall_posts USING GIN (audience_group_ids);

-- RLS SELECT : ajoute la branche 'group' sans exposer le groupe.
DROP POLICY IF EXISTS wall_posts_select ON public.wall_posts;
CREATE POLICY wall_posts_select ON public.wall_posts
  FOR SELECT
  USING (
    public.is_club_member(auth.uid(), club_id)
    AND (
      -- Branches existantes (club / team / multi_team) — la fonction gère
      -- déjà le bypass admin/dirigeant et la visibilité par équipe.
      (
        audience_type <> 'group'
        AND public.user_in_wall_audience(auth.uid(), club_id, audience_team_ids)
      )
      -- Nouvelle branche 'group' : membre d'au moins un des groupes ciblés,
      -- ou admin/dirigeant du club. Le groupe lui-même n'est pas exposé.
      OR (
        audience_type = 'group'
        AND (
          public.has_club_role(auth.uid(), club_id, 'admin'::app_role)
          OR public.has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
          OR EXISTS (
            SELECT 1
            FROM public.club_group_members cgm
            JOIN public.club_members cm ON cm.id = cgm.member_id
            WHERE cgm.group_id = ANY (wall_posts.audience_group_ids)
              AND cm.user_id = auth.uid()
          )
        )
      )
    )
  );
