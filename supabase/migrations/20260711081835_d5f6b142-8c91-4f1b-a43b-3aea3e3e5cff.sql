ALTER TABLE public.sponsors DROP CONSTRAINT IF EXISTS sponsors_logo_scale_check;
UPDATE public.sponsors SET logo_scale = 1.20 WHERE logo_scale > 1.20;
ALTER TABLE public.sponsors ADD CONSTRAINT sponsors_logo_scale_check CHECK (logo_scale >= 0.75 AND logo_scale <= 1.20);