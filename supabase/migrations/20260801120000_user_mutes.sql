-- Masquage personnel d'un membre (« bloquer » au sens des stores Google/Apple) :
-- l'utilisateur ne voit plus les contenus sociaux (mur, commentaires, réactions,
-- chat d'événement) publiés par la personne masquée. Les communications
-- officielles (convocations, événements, notifications) ne sont pas affectées.
CREATE TABLE public.user_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, muted_user_id),
  CONSTRAINT user_mutes_not_self CHECK (user_id <> muted_user_id)
);

CREATE INDEX idx_user_mutes_user ON public.user_mutes(user_id);

GRANT SELECT, INSERT, DELETE ON public.user_mutes TO authenticated;
GRANT ALL ON public.user_mutes TO service_role;

ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;

-- Chacun ne gère et ne lit que sa propre liste.
CREATE POLICY "user_mutes_select_own" ON public.user_mutes
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user_mutes_insert_own" ON public.user_mutes
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_mutes_delete_own" ON public.user_mutes
FOR DELETE TO authenticated
USING (user_id = auth.uid());
