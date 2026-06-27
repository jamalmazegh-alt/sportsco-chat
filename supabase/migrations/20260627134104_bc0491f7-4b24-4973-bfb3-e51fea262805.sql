
ALTER TABLE public.tournament_teams
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','exempt')),
  ADD COLUMN IF NOT EXISTS amount_paid_cents integer,
  ADD COLUMN IF NOT EXISTS payment_currency text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_note text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.set_tournament_team_payment(
  _team_id uuid,
  _status text,
  _amount_cents integer DEFAULT NULL,
  _currency text DEFAULT NULL,
  _method text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS public.tournament_teams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tournament_id uuid;
  _club_id uuid;
  _uid uuid := auth.uid();
  _row public.tournament_teams;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('unpaid','paid','exempt') THEN
    RAISE EXCEPTION 'Invalid status %', _status USING ERRCODE = '22023';
  END IF;

  SELECT tt.tournament_id, t.club_id
    INTO _tournament_id, _club_id
  FROM public.tournament_teams tt
  JOIN public.tournaments t ON t.id = tt.tournament_id
  WHERE tt.id = _team_id;

  IF _tournament_id IS NULL THEN
    RAISE EXCEPTION 'Team not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorize: club admin/coach OR tournament collaborator OR creator OR superadmin
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = _club_id AND cm.user_id = _uid AND cm.role IN ('admin','coach')
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_collaborators tc
      WHERE tc.tournament_id = _tournament_id AND tc.user_id = _uid
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = _tournament_id AND t.created_by = _uid
    )
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = _uid)
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tournament_teams
  SET payment_status = _status,
      amount_paid_cents = CASE WHEN _status = 'paid' THEN COALESCE(_amount_cents, amount_paid_cents) ELSE NULL END,
      payment_currency = CASE WHEN _status = 'paid' THEN COALESCE(_currency, payment_currency, 'eur') ELSE NULL END,
      payment_method = CASE WHEN _status = 'paid' THEN COALESCE(_method, payment_method) ELSE NULL END,
      payment_note = _note,
      paid_at = CASE WHEN _status = 'paid' THEN now() ELSE NULL END,
      marked_paid_by = CASE WHEN _status = 'paid' THEN _uid ELSE NULL END
  WHERE id = _team_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tournament_team_payment(uuid, text, integer, text, text, text) TO authenticated;
