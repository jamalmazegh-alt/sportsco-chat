-- 1) Table
CREATE TABLE IF NOT EXISTS public.club_notification_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  convocation_on_create boolean NOT NULL DEFAULT true,
  convocation_reminder boolean NOT NULL DEFAULT true,
  convocation_coach_each_response boolean NOT NULL DEFAULT false,
  convocation_coach_complete boolean NOT NULL DEFAULT true,
  event_reschedule boolean NOT NULL DEFAULT true,
  event_cancel boolean NOT NULL DEFAULT true,
  wall_new_post boolean NOT NULL DEFAULT true,
  tournament_match_reminder boolean NOT NULL DEFAULT true,
  tournament_draw boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_notification_settings TO authenticated;
GRANT ALL ON public.club_notification_settings TO service_role;

-- 3) RLS
ALTER TABLE public.club_notification_settings ENABLE ROW LEVEL SECURITY;

-- Admins/dirigeants can read their club's settings
DROP POLICY IF EXISTS club_notification_settings_select ON public.club_notification_settings;
CREATE POLICY club_notification_settings_select
  ON public.club_notification_settings FOR SELECT
  TO authenticated
  USING (
    has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
  );

-- Admins/dirigeants can write (insert/update/delete) their club's settings
DROP POLICY IF EXISTS club_notification_settings_write ON public.club_notification_settings;
CREATE POLICY club_notification_settings_write
  ON public.club_notification_settings FOR ALL
  TO authenticated
  USING (
    has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
  )
  WITH CHECK (
    has_club_role(auth.uid(), club_id, 'admin'::app_role)
    OR has_club_role(auth.uid(), club_id, 'dirigeant'::app_role)
  );

-- 4) updated_at trigger
DROP TRIGGER IF EXISTS update_club_notification_settings_updated_at ON public.club_notification_settings;
CREATE TRIGGER update_club_notification_settings_updated_at
  BEFORE UPDATE ON public.club_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();