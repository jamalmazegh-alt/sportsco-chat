ALTER TABLE public.club_notification_settings
  ADD COLUMN IF NOT EXISTS event_chat_new_message boolean NOT NULL DEFAULT true;