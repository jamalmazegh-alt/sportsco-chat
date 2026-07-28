UPDATE public.clubs
SET convocation_channels = '["email", "in_app"]'::jsonb
WHERE name = 'FC VALLEE DU LOT'
  AND (convocation_channels IS NULL OR convocation_channels = '[]'::jsonb);