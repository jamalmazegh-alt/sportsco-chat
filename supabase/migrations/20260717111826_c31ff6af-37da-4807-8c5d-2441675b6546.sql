ALTER TABLE public.member_invites ADD COLUMN IF NOT EXISTS email_message_id text;
CREATE INDEX IF NOT EXISTS member_invites_email_message_id_idx ON public.member_invites (email_message_id);