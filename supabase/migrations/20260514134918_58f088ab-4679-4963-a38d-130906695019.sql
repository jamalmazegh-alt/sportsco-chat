ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS convocation_channels jsonb NOT NULL DEFAULT '["email","in_app"]'::jsonb,
  ADD COLUMN IF NOT EXISTS wall_comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS event_chat_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS event_chat_players_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS event_chat_parents_enabled boolean NOT NULL DEFAULT false;