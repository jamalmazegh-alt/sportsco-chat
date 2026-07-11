
-- Add a default so the TS Insert type marks slug as optional.
-- The autofill BEFORE-INSERT trigger overwrites this placeholder before
-- the validation trigger and NOT NULL check ever see it.
ALTER TABLE public.clubs
  ALTER COLUMN slug SET DEFAULT '';
