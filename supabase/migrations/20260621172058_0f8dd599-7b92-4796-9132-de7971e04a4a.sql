ALTER TABLE public.club_notification_settings
ADD COLUMN IF NOT EXISTS score_result boolean DEFAULT true;