ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_theme_color_check;
ALTER TABLE public.clubs ADD CONSTRAINT clubs_theme_color_check
CHECK (theme_color IN ('emerald','ocean','indigo','violet','rose','amber','crimson','slate','sky','teal','noir'));