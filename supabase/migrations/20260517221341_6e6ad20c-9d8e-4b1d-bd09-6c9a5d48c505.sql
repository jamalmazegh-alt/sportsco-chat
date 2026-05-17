ALTER TABLE public.event_goals DROP CONSTRAINT event_goals_kind_check;
ALTER TABLE public.event_goals ADD CONSTRAINT event_goals_kind_check
  CHECK (kind = ANY (ARRAY['goal','own_goal','penalty','assist','try','point','yellow_card','red_card','white_card','foul']));