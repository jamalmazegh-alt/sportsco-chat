ALTER TABLE public.sponsors ALTER COLUMN target_url DROP NOT NULL;
ALTER TABLE public.sponsors DROP CONSTRAINT IF EXISTS sponsors_target_url_check;
ALTER TABLE public.sponsors ADD CONSTRAINT sponsors_target_url_check CHECK (target_url IS NULL OR target_url ~* '^https?://');