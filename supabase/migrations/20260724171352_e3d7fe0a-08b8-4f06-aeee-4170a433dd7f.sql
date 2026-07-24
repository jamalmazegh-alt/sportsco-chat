CREATE TABLE IF NOT EXISTS public.parent_link_notifications (
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_user_id, player_id)
);

GRANT SELECT ON public.parent_link_notifications TO authenticated;
GRANT ALL ON public.parent_link_notifications TO service_role;

ALTER TABLE public.parent_link_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'parent_link_notifications'
       AND policyname = 'parent_link_notifications_self_read'
  ) THEN
    CREATE POLICY "parent_link_notifications_self_read"
      ON public.parent_link_notifications
      FOR SELECT
      TO authenticated
      USING (parent_user_id = auth.uid());
  END IF;
END $$;