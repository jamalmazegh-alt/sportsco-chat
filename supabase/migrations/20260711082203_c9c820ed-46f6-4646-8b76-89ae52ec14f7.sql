ALTER TABLE public.sponsors DROP CONSTRAINT IF EXISTS sponsors_logo_scale_check;
ALTER TABLE public.sponsors ADD CONSTRAINT sponsors_logo_scale_check CHECK (logo_scale >= 0.75 AND logo_scale <= 2.00);