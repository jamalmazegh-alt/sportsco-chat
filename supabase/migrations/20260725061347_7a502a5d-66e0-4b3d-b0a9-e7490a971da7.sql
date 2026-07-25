ALTER TABLE public.club_publication_audiences DROP CONSTRAINT IF EXISTS pub_aud_shape_chk;

ALTER TABLE public.club_publication_audiences
ADD CONSTRAINT pub_aud_shape_chk CHECK (
  (audience_type = 'groupe_personnalise' AND group_id IS NOT NULL AND team_id IS NULL AND category_label IS NULL AND event_id IS NULL)
  OR (audience_type IN ('joueurs_equipe','parents_equipe','staff_equipe') AND team_id IS NOT NULL AND group_id IS NULL AND category_label IS NULL AND event_id IS NULL)
  OR (audience_type IN ('joueurs_categorie','parents_categorie') AND category_label IS NOT NULL AND group_id IS NULL AND team_id IS NULL AND event_id IS NULL)
  OR (audience_type IN ('joueurs_convoques','parents_convoques') AND event_id IS NOT NULL AND group_id IS NULL AND team_id IS NULL AND category_label IS NULL)
  OR (audience_type IN ('educateurs','dirigeants','selection_manuelle') AND group_id IS NULL AND team_id IS NULL AND category_label IS NULL AND event_id IS NULL)
);