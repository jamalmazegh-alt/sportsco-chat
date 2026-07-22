-- LOT 1 — Présence de réunion (meeting attendees)
CREATE TABLE public.meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  status public.attendance_status NOT NULL DEFAULT 'pending',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  added_manually boolean NOT NULL DEFAULT false,
  comment text,
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_attendees_event_user_unique UNIQUE (event_id, user_id),
  CONSTRAINT meeting_attendees_comment_len CHECK (comment IS NULL OR char_length(comment) <= 1000)
);

CREATE INDEX meeting_attendees_event_id_idx ON public.meeting_attendees(event_id);
CREATE INDEX meeting_attendees_club_id_idx ON public.meeting_attendees(club_id);
CREATE INDEX meeting_attendees_user_id_idx ON public.meeting_attendees(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_attendees TO authenticated;
GRANT ALL ON public.meeting_attendees TO service_role;

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_attendees_staff_all"
  ON public.meeting_attendees FOR ALL TO authenticated
  USING (public.is_club_staff(auth.uid(), club_id))
  WITH CHECK (public.is_club_staff(auth.uid(), club_id));

CREATE POLICY "meeting_attendees_self_select"
  ON public.meeting_attendees FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "meeting_attendees_self_update"
  ON public.meeting_attendees FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS set_meeting_attendees_updated_at ON public.meeting_attendees;
CREATE TRIGGER set_meeting_attendees_updated_at
  BEFORE UPDATE ON public.meeting_attendees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_meeting_attendees_atomic(
  _event_id UUID,
  _actor UUID,
  _audiences JSONB DEFAULT '[]'::jsonb,
  _manual_user_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE(
  attendees_count INT,
  inserted_count INT,
  inserted_user_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_club_id UUID;
  v_type public.event_type;
  v_now TIMESTAMPTZ := now();
  v_inserted_ids UUID[];
  v_inserted INT := 0;
  v_total INT := 0;
BEGIN
  IF _event_id IS NULL OR _actor IS NULL THEN
    RAISE EXCEPTION 'event_id and actor required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT (
    coalesce(auth.jwt()->>'role','') = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = _actor)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT t.club_id, e.type
    INTO v_club_id, v_type
  FROM public.events e
  JOIN public.teams t ON t.id = e.team_id
  WHERE e.id = _event_id
  FOR UPDATE OF e;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_type <> 'meeting' THEN
    RAISE EXCEPTION 'not_a_meeting' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_club_staff(_actor, v_club_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH resolved AS (
    SELECT r.user_id
    FROM public.resolve_audience_members(v_club_id, _audiences) r
    WHERE r.user_id IS NOT NULL
    UNION
    SELECT unnest(coalesce(_manual_user_ids, ARRAY[]::UUID[])) AS user_id
  ),
  targets AS (
    SELECT DISTINCT rr.user_id
    FROM resolved rr
    WHERE rr.user_id IS NOT NULL
  ),
  members AS (
    SELECT t.user_id,
           (SELECT cm.id FROM public.club_members cm
             WHERE cm.club_id = v_club_id AND cm.user_id = t.user_id
             LIMIT 1) AS member_id,
           EXISTS (
             SELECT 1 FROM unnest(coalesce(_manual_user_ids, ARRAY[]::UUID[])) mu(uid)
             WHERE mu.uid = t.user_id
           ) AS manual
    FROM targets t
  ),
  inserted AS (
    INSERT INTO public.meeting_attendees
      (event_id, club_id, user_id, member_id, sources, added_manually, invited_at)
    SELECT _event_id, v_club_id, m.user_id, m.member_id,
           coalesce(_audiences, '[]'::jsonb), m.manual, v_now
    FROM members m
    ON CONFLICT (event_id, user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT array_agg(i.user_id), count(*)::int
    INTO v_inserted_ids, v_inserted
  FROM inserted i;

  SELECT count(*)::int INTO v_total
  FROM public.meeting_attendees WHERE event_id = _event_id;

  RETURN QUERY SELECT
    coalesce(v_total, 0),
    coalesce(v_inserted, 0),
    coalesce(v_inserted_ids, ARRAY[]::UUID[]);
END;
$$;

REVOKE ALL ON FUNCTION public.set_meeting_attendees_atomic(UUID, UUID, JSONB, UUID[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_meeting_attendees_atomic(UUID, UUID, JSONB, UUID[]) TO authenticated, service_role;