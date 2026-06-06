ALTER TABLE public.match_results ADD COLUMN IF NOT EXISTS score_details JSONB;

-- Drop old kind constraint if present and add a broader one
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.event_goals'::regclass AND contype = 'c' AND conname LIKE '%kind%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.event_goals DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.event_goals
  ADD CONSTRAINT event_goals_kind_check
  CHECK (kind IN ('goal','own_goal','penalty','assist','try','point','yellow_card','red_card','foul'));