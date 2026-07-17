ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

COMMENT ON COLUMN public.email_send_log.provider IS 'Identifiant du sender ayant traité l''envoi (lovable, ses, brevo, ...). NULL sur les lignes antérieures à la Phase 1 de la migration multi-provider.';
COMMENT ON COLUMN public.email_send_log.provider_message_id IS 'ID de message retourné par le provider externe (distinct de message_id qui est notre clé métier de déduplication).';