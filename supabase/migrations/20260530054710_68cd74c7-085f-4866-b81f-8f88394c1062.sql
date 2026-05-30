
-- ============================================================
-- 1. PLAYERS — club_id nullable + claim cols + RLS update
-- ============================================================

ALTER TABLE public.players ALTER COLUMN club_id DROP NOT NULL;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS claim_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_status text
    CHECK (claim_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS claim_requested_at timestamptz;

-- Independent player access: own row OR super-admin when club_id IS NULL
DROP POLICY IF EXISTS players_independent_select ON public.players;
CREATE POLICY players_independent_select ON public.players
  FOR SELECT TO authenticated
  USING (
    club_id IS NULL
    AND (user_id = auth.uid() OR has_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS players_independent_write ON public.players;
CREATE POLICY players_independent_write ON public.players
  FOR ALL TO authenticated
  USING (
    club_id IS NULL
    AND (user_id = auth.uid() OR has_super_admin(auth.uid()))
  )
  WITH CHECK (
    club_id IS NULL
    AND (user_id = auth.uid() OR has_super_admin(auth.uid()))
  );

-- ============================================================
-- 2. PROFILES — enrichment
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'FR',
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS profile_visibility text DEFAULT 'private'
    CHECK (profile_visibility IN ('private','club','public')),
  ADD COLUMN IF NOT EXISTS is_independent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS person_type text DEFAULT 'user'
    CHECK (person_type IN ('player','coach','parent','staff','user')),
  ADD COLUMN IF NOT EXISTS looking_for_club boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parental_public_consent boolean DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_slug_unique
  ON public.profiles(public_slug) WHERE public_slug IS NOT NULL;

-- ============================================================
-- 3. COACH PROFILES + DIPLOMAS + CLUB HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coach_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  sport text,
  speciality text,
  philosophy text,
  years_experience integer,
  looking_for_club boolean DEFAULT false,
  public_slug text UNIQUE,
  public_profile_enabled boolean DEFAULT false,
  profile_visibility text DEFAULT 'club'
    CHECK (profile_visibility IN ('private','club','public')),
  followers_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS coach_profiles_user_id_idx ON public.coach_profiles(user_id);
CREATE INDEX IF NOT EXISTS coach_profiles_current_club_id_idx ON public.coach_profiles(current_club_id);

GRANT SELECT ON public.coach_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_profiles TO authenticated;
GRANT ALL ON public.coach_profiles TO service_role;

ALTER TABLE public.coach_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_profiles_select_public ON public.coach_profiles
  FOR SELECT TO anon, authenticated
  USING (public_profile_enabled = true AND profile_visibility = 'public');

CREATE POLICY coach_profiles_select_own ON public.coach_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY coach_profiles_select_club ON public.coach_profiles
  FOR SELECT TO authenticated
  USING (current_club_id IS NOT NULL AND is_club_member(auth.uid(), current_club_id));

CREATE POLICY coach_profiles_insert_self ON public.coach_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY coach_profiles_update_own ON public.coach_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY coach_profiles_delete_own ON public.coach_profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_super_admin(auth.uid()));

-- diplomas
CREATE TABLE IF NOT EXISTS public.coach_diplomas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  issuing_body text,
  obtained_at date,
  expiry_date date,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_diplomas_coach_id_idx ON public.coach_diplomas(coach_id);

GRANT SELECT ON public.coach_diplomas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_diplomas TO authenticated;
GRANT ALL ON public.coach_diplomas TO service_role;

ALTER TABLE public.coach_diplomas ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_diplomas_select ON public.coach_diplomas
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coach_profiles cp
    WHERE cp.id = coach_diplomas.coach_id
      AND (
        (cp.public_profile_enabled AND cp.profile_visibility = 'public')
        OR cp.user_id = auth.uid()
        OR (cp.current_club_id IS NOT NULL AND is_club_member(auth.uid(), cp.current_club_id))
      )
  ));

CREATE POLICY coach_diplomas_write_own ON public.coach_diplomas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_profiles cp WHERE cp.id = coach_diplomas.coach_id AND cp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.coach_profiles cp WHERE cp.id = coach_diplomas.coach_id AND cp.user_id = auth.uid()));

-- club history
CREATE TABLE IF NOT EXISTS public.coach_club_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  club_name text NOT NULL,
  role text,
  sport text,
  joined_at date,
  left_at date,
  is_current boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_club_history_coach_id_idx ON public.coach_club_history(coach_id);

GRANT SELECT ON public.coach_club_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_club_history TO authenticated;
GRANT ALL ON public.coach_club_history TO service_role;

ALTER TABLE public.coach_club_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY coach_club_history_select ON public.coach_club_history
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coach_profiles cp
    WHERE cp.id = coach_club_history.coach_id
      AND (
        (cp.public_profile_enabled AND cp.profile_visibility = 'public')
        OR cp.user_id = auth.uid()
        OR (cp.current_club_id IS NOT NULL AND is_club_member(auth.uid(), cp.current_club_id))
      )
  ));

CREATE POLICY coach_club_history_write_own ON public.coach_club_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coach_profiles cp WHERE cp.id = coach_club_history.coach_id AND cp.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.coach_profiles cp WHERE cp.id = coach_club_history.coach_id AND cp.user_id = auth.uid()));

-- ============================================================
-- 4. CLUBS — extra cols
-- ============================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS looking_for_coach boolean DEFAULT false;

-- ============================================================
-- 5. FOLLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('player','coach','club')),
  followed_player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  followed_coach_id uuid REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  followed_club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CHECK (
    (followed_player_id IS NOT NULL)::int +
    (followed_coach_id  IS NOT NULL)::int +
    (followed_club_id   IS NOT NULL)::int = 1
  ),
  UNIQUE(follower_id, followed_player_id),
  UNIQUE(follower_id, followed_coach_id),
  UNIQUE(follower_id, followed_club_id)
);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_target_player_idx ON public.follows(target_type, followed_player_id);
CREATE INDEX IF NOT EXISTS follows_target_coach_idx ON public.follows(target_type, followed_coach_id);
CREATE INDEX IF NOT EXISTS follows_target_club_idx ON public.follows(target_type, followed_club_id);

GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_select_own ON public.follows
  FOR SELECT TO authenticated USING (follower_id = auth.uid());

CREATE POLICY follows_insert_own ON public.follows
  FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());

CREATE POLICY follows_delete_own ON public.follows
  FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- followers_count trigger
CREATE OR REPLACE FUNCTION public.follows_update_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.followed_player_id IS NOT NULL THEN
      SELECT user_id INTO target_user FROM public.players WHERE id = NEW.followed_player_id;
      IF target_user IS NOT NULL THEN
        UPDATE public.profiles SET followers_count = COALESCE(followers_count,0) + 1 WHERE id = target_user;
      END IF;
    ELSIF NEW.followed_coach_id IS NOT NULL THEN
      UPDATE public.coach_profiles SET followers_count = COALESCE(followers_count,0) + 1 WHERE id = NEW.followed_coach_id;
    ELSIF NEW.followed_club_id IS NOT NULL THEN
      UPDATE public.clubs SET followers_count = COALESCE(followers_count,0) + 1 WHERE id = NEW.followed_club_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.followed_player_id IS NOT NULL THEN
      SELECT user_id INTO target_user FROM public.players WHERE id = OLD.followed_player_id;
      IF target_user IS NOT NULL THEN
        UPDATE public.profiles SET followers_count = GREATEST(0, COALESCE(followers_count,0) - 1) WHERE id = target_user;
      END IF;
    ELSIF OLD.followed_coach_id IS NOT NULL THEN
      UPDATE public.coach_profiles SET followers_count = GREATEST(0, COALESCE(followers_count,0) - 1) WHERE id = OLD.followed_coach_id;
    ELSIF OLD.followed_club_id IS NOT NULL THEN
      UPDATE public.clubs SET followers_count = GREATEST(0, COALESCE(followers_count,0) - 1) WHERE id = OLD.followed_club_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS follows_count_trg ON public.follows;
CREATE TRIGGER follows_count_trg
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.follows_update_counts();

-- ============================================================
-- 6. FEED EVENTS (immutable)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'player_joined_club','player_achievement','player_milestone','player_transfer',
    'player_public_profile_created','player_video_added',
    'coach_joined_club','coach_diploma','coach_public_profile_created',
    'club_created','club_tournament_won','club_season_started'
  )),
  target_type text NOT NULL CHECK (target_type IN ('player','coach','club')),
  actor_player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  actor_coach_id uuid REFERENCES public.coach_profiles(id) ON DELETE CASCADE,
  actor_club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  visibility text DEFAULT 'public' CHECK (visibility IN ('private','club','public')),
  occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_events_occurred_idx ON public.feed_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS feed_events_target_type_idx ON public.feed_events(target_type);
CREATE INDEX IF NOT EXISTS feed_events_actor_player_idx ON public.feed_events(actor_player_id);
CREATE INDEX IF NOT EXISTS feed_events_actor_coach_idx ON public.feed_events(actor_coach_id);
CREATE INDEX IF NOT EXISTS feed_events_actor_club_idx ON public.feed_events(actor_club_id);

GRANT SELECT ON public.feed_events TO anon, authenticated;
GRANT ALL ON public.feed_events TO service_role;

ALTER TABLE public.feed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_events_select_public ON public.feed_events
  FOR SELECT TO anon, authenticated
  USING (visibility = 'public');

CREATE POLICY feed_events_select_club ON public.feed_events
  FOR SELECT TO authenticated
  USING (
    visibility = 'club' AND (
      (actor_club_id IS NOT NULL AND is_club_member(auth.uid(), actor_club_id))
      OR (actor_player_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.players p WHERE p.id = actor_player_id AND p.club_id IS NOT NULL AND is_club_member(auth.uid(), p.club_id)
      ))
      OR (actor_coach_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.coach_profiles cp WHERE cp.id = actor_coach_id AND cp.current_club_id IS NOT NULL AND is_club_member(auth.uid(), cp.current_club_id)
      ))
    )
  );

CREATE POLICY feed_events_select_private ON public.feed_events
  FOR SELECT TO authenticated
  USING (
    visibility = 'private' AND (
      (actor_player_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.players p WHERE p.id = actor_player_id AND p.user_id = auth.uid()))
      OR (actor_coach_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.coach_profiles cp WHERE cp.id = actor_coach_id AND cp.user_id = auth.uid()))
      OR (actor_club_id IS NOT NULL AND has_club_role(auth.uid(), actor_club_id, 'admin'::app_role))
    )
  );

-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER triggers can write

-- ============================================================
-- 7. SLUG GENERATION — extend with optional name/birth
-- ============================================================

CREATE OR REPLACE FUNCTION public.gen_player_public_slug(
  _first_name text DEFAULT NULL,
  _last_name text DEFAULT NULL,
  _birth_date date DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  is_minor boolean := false;
  base text;
  candidate text;
  attempts int := 0;
  suffix text;
BEGIN
  IF _birth_date IS NOT NULL THEN
    is_minor := age(_birth_date) < interval '18 years';
  END IF;

  IF is_minor OR _first_name IS NULL OR _last_name IS NULL THEN
    -- minors or unknown: random 10 chars, no name
    LOOP
      candidate := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.players WHERE public_slug = candidate);
      attempts := attempts + 1;
      IF attempts > 5 THEN
        candidate := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
        EXIT;
      END IF;
    END LOOP;
    RETURN candidate;
  END IF;

  -- adults: prenom-nom-xxxx
  base := lower(regexp_replace(
    unaccent_compat(_first_name) || '-' || unaccent_compat(_last_name),
    '[^a-z0-9]+', '-', 'g'
  ));
  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  IF base = '' THEN base := 'player'; END IF;

  LOOP
    suffix := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    candidate := base || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.players WHERE public_slug = candidate);
    attempts := attempts + 1;
    IF attempts > 8 THEN
      candidate := base || '-' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- Fallback unaccent helper if extension is not available — simple ASCII slug.
CREATE OR REPLACE FUNCTION public.unaccent_compat(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(
    COALESCE(t, ''),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );
$$;

CREATE OR REPLACE FUNCTION public.gen_coach_public_slug(_first_name text, _last_name text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix text;
  attempts int := 0;
BEGIN
  base := lower(regexp_replace(
    public.unaccent_compat(COALESCE(_first_name,'') || '-' || COALESCE(_last_name,'')),
    '[^a-z0-9]+', '-', 'g'
  ));
  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  IF base = '' THEN base := 'coach'; END IF;
  LOOP
    suffix := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    candidate := base || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coach_profiles WHERE public_slug = candidate);
    attempts := attempts + 1;
    IF attempts > 8 THEN
      candidate := base || '-' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- ============================================================
-- 8. FEED TRIGGERS
-- ============================================================

-- club_members → player/coach joined club
CREATE OR REPLACE FUNCTION public.feed_on_club_member_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text;
  v_club_name text;
  v_player_id uuid;
  v_coach_id uuid;
  v_public boolean := false;
  v_is_minor boolean := false;
  v_consent boolean := false;
  v_event_type text;
BEGIN
  SELECT full_name, (birth_date IS NOT NULL AND age(birth_date) < interval '18 years'), COALESCE(parental_public_consent,false)
    INTO v_full_name, v_is_minor, v_consent
    FROM public.profiles WHERE id = NEW.user_id;
  SELECT name INTO v_club_name FROM public.clubs WHERE id = NEW.club_id;

  IF NEW.role = 'player' OR 'player' = ANY(NEW.roles) THEN
    SELECT id, public_profile_enabled INTO v_player_id, v_public
      FROM public.players WHERE user_id = NEW.user_id AND club_id = NEW.club_id
      ORDER BY created_at DESC LIMIT 1;
    v_event_type := 'player_joined_club';
  ELSIF NEW.role = 'coach' OR 'coach' = ANY(NEW.roles) THEN
    SELECT id, public_profile_enabled INTO v_coach_id, v_public
      FROM public.coach_profiles WHERE user_id = NEW.user_id LIMIT 1;
    v_event_type := 'coach_joined_club';
  ELSE
    RETURN NEW;
  END IF;

  IF NOT v_public THEN RETURN NEW; END IF;
  IF v_is_minor AND NOT v_consent THEN RETURN NEW; END IF;

  -- idempotency
  IF EXISTS (
    SELECT 1 FROM public.feed_events
    WHERE event_type = v_event_type
      AND COALESCE(actor_player_id, '00000000-0000-0000-0000-000000000000') = COALESCE(v_player_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(actor_coach_id, '00000000-0000-0000-0000-000000000000') = COALESCE(v_coach_id, '00000000-0000-0000-0000-000000000000')
      AND actor_club_id = NEW.club_id
  ) THEN RETURN NEW; END IF;

  INSERT INTO public.feed_events(event_type, target_type, actor_player_id, actor_coach_id, actor_club_id, title, metadata, visibility)
  VALUES (
    v_event_type,
    CASE WHEN v_player_id IS NOT NULL THEN 'player' WHEN v_coach_id IS NOT NULL THEN 'coach' ELSE 'club' END,
    v_player_id, v_coach_id, NEW.club_id,
    COALESCE(v_full_name,'') || ' → ' || COALESCE(v_club_name,''),
    jsonb_build_object('club_name', v_club_name, 'full_name', v_full_name),
    'public'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_on_club_member_insert_trg ON public.club_members;
CREATE TRIGGER feed_on_club_member_insert_trg
  AFTER INSERT ON public.club_members
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_club_member_insert();

-- player_achievements confirmed → feed
CREATE OR REPLACE FUNCTION public.feed_on_player_achievement_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_public boolean;
  v_minor boolean;
  v_consent boolean;
  v_uid uuid;
  v_full_name text;
BEGIN
  IF NEW.status <> 'confirmed' OR NEW.visibility <> 'public' THEN RETURN NEW; END IF;
  IF (TG_OP = 'UPDATE') AND (OLD.status = 'confirmed' AND OLD.visibility = 'public') THEN
    RETURN NEW; -- already announced
  END IF;

  SELECT public_profile_enabled, user_id INTO v_public, v_uid FROM public.players WHERE id = NEW.player_id;
  IF NOT COALESCE(v_public,false) THEN RETURN NEW; END IF;

  IF v_uid IS NOT NULL THEN
    SELECT (birth_date IS NOT NULL AND age(birth_date) < interval '18 years'), COALESCE(parental_public_consent,false), full_name
      INTO v_minor, v_consent, v_full_name
      FROM public.profiles WHERE id = v_uid;
    IF v_minor AND NOT v_consent THEN RETURN NEW; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.feed_events WHERE event_type='player_achievement' AND actor_player_id = NEW.player_id AND metadata->>'achievement_id' = NEW.id::text) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.feed_events(event_type, target_type, actor_player_id, actor_club_id, title, description, metadata, visibility)
  VALUES (
    'player_achievement', 'player', NEW.player_id, NEW.club_id,
    NEW.title, NEW.description,
    jsonb_build_object('achievement_id', NEW.id, 'achievement_type', NEW.achievement_type, 'season_label', NEW.season_label),
    'public'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_on_player_achievement_trg ON public.player_achievements;
CREATE TRIGGER feed_on_player_achievement_trg
  AFTER INSERT OR UPDATE ON public.player_achievements
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_player_achievement_confirmed();

-- coach_diplomas → feed
CREATE OR REPLACE FUNCTION public.feed_on_coach_diploma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_public boolean;
  v_full_name text;
  v_uid uuid;
BEGIN
  SELECT public_profile_enabled, user_id INTO v_public, v_uid FROM public.coach_profiles WHERE id = NEW.coach_id;
  IF NOT COALESCE(v_public,false) THEN RETURN NEW; END IF;
  SELECT full_name INTO v_full_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.feed_events(event_type, target_type, actor_coach_id, title, metadata, visibility)
  VALUES (
    'coach_diploma', 'coach', NEW.coach_id,
    COALESCE(v_full_name,'Coach') || ' — ' || NEW.name,
    jsonb_build_object('diploma_id', NEW.id, 'name', NEW.name, 'issuing_body', NEW.issuing_body),
    'public'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_on_coach_diploma_trg ON public.coach_diplomas;
CREATE TRIGGER feed_on_coach_diploma_trg
  AFTER INSERT ON public.coach_diplomas
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_coach_diploma();

-- players.public_profile_enabled → feed
CREATE OR REPLACE FUNCTION public.feed_on_player_public_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_minor boolean;
  v_consent boolean;
  v_full_name text;
BEGIN
  IF NOT (NEW.public_profile_enabled = true AND COALESCE(OLD.public_profile_enabled,false) = false) THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    SELECT (birth_date IS NOT NULL AND age(birth_date) < interval '18 years'), COALESCE(parental_public_consent,false), full_name
      INTO v_minor, v_consent, v_full_name
      FROM public.profiles WHERE id = NEW.user_id;
    IF v_minor AND NOT v_consent THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.feed_events(event_type, target_type, actor_player_id, actor_club_id, title, visibility)
  VALUES (
    'player_public_profile_created', 'player', NEW.id, NEW.club_id,
    COALESCE(v_full_name, NEW.first_name || ' ' || NEW.last_name) || ' — profil public',
    'public'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_on_player_public_enabled_trg ON public.players;
CREATE TRIGGER feed_on_player_public_enabled_trg
  AFTER UPDATE OF public_profile_enabled ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_player_public_enabled();

-- coach_profiles.public_profile_enabled → feed
CREATE OR REPLACE FUNCTION public.feed_on_coach_public_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text;
BEGIN
  IF NOT (NEW.public_profile_enabled = true AND COALESCE(OLD.public_profile_enabled,false) = false) THEN
    RETURN NEW;
  END IF;
  SELECT full_name INTO v_full_name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.feed_events(event_type, target_type, actor_coach_id, actor_club_id, title, visibility)
  VALUES (
    'coach_public_profile_created', 'coach', NEW.id, NEW.current_club_id,
    COALESCE(v_full_name,'Coach') || ' — profil public',
    'public'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_on_coach_public_enabled_trg ON public.coach_profiles;
CREATE TRIGGER feed_on_coach_public_enabled_trg
  AFTER UPDATE OF public_profile_enabled ON public.coach_profiles
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_coach_public_enabled();

-- clubs created → feed (skip personal + RLS/E2E sentinels)
CREATE OR REPLACE FUNCTION public.feed_on_club_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_personal, false) THEN RETURN NEW; END IF;
  IF NEW.name LIKE '__rls_%' OR NEW.name LIKE '__e2e_%' THEN RETURN NEW; END IF;
  INSERT INTO public.feed_events(event_type, target_type, actor_club_id, title, visibility)
  VALUES ('club_created', 'club', NEW.id, NEW.name || ' a rejoint Clubero', 'public');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_on_club_created_trg ON public.clubs;
CREATE TRIGGER feed_on_club_created_trg
  AFTER INSERT ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.feed_on_club_created();
