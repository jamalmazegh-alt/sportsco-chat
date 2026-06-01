-- FIX 10: unified recompute based on net paid (gross - refunded) per succeeded tx
CREATE OR REPLACE FUNCTION public.recompute_obligation_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _obl_id uuid;
  _due integer;
  _net_paid integer;
  _ever_paid boolean;
  _current_status payment_obligation_status;
  _new_status payment_obligation_status;
BEGIN
  _obl_id := COALESCE(NEW.obligation_id, OLD.obligation_id);

  SELECT amount_due_cents, status INTO _due, _current_status
  FROM public.payment_obligations WHERE id = _obl_id FOR UPDATE;

  IF _current_status IN ('cancelled','exempted') THEN
    RETURN NEW;
  END IF;

  -- Net paid = sum of (gross - refunded) over succeeded transactions only.
  -- Refund records (status='refunded') are excluded; their effect is already
  -- captured by the refunded_amount_cents column on the parent succeeded tx.
  SELECT
    COALESCE(SUM(amount_gross_cents - COALESCE(refunded_amount_cents, 0))
             FILTER (WHERE status = 'succeeded'), 0),
    bool_or(status = 'succeeded' AND amount_gross_cents > 0)
  INTO _net_paid, _ever_paid
  FROM public.payment_transactions WHERE obligation_id = _obl_id;

  IF _net_paid <= 0 AND COALESCE(_ever_paid, false) THEN
    -- Had payments at some point, but everything has been refunded.
    _new_status := 'refunded';
  ELSIF _net_paid <= 0 THEN
    _new_status := 'pending';
  ELSIF _net_paid >= _due THEN
    _new_status := 'paid';
  ELSE
    _new_status := 'partially_paid';
  END IF;

  IF _new_status <> _current_status THEN
    UPDATE public.payment_obligations
      SET status = _new_status, updated_at = now()
      WHERE id = _obl_id;
  END IF;

  RETURN NEW;
END $$;

-- FIX 9: coach sees only paid/unpaid for players on teams they coach
CREATE OR REPLACE FUNCTION public.coach_player_payment_status(_club_id uuid)
RETURNS TABLE (player_id uuid, payment_item_id uuid, item_title text, is_paid boolean)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT o.player_id, o.payment_item_id, pi.title,
         (o.status = 'paid' OR o.status = 'exempted') AS is_paid
  FROM public.payment_obligations o
  JOIN public.payment_items pi ON pi.id = o.payment_item_id
  WHERE o.club_id = _club_id
    AND o.player_id IS NOT NULL
    AND (
      -- Admins and financial admins keep full visibility
      public.has_club_role(auth.uid(), _club_id, 'admin'::app_role)
      OR public.has_club_role(auth.uid(), _club_id, 'financial_admin'::app_role)
      -- Coaches: only players in teams where the caller is a coach
      OR EXISTS (
        SELECT 1
        FROM public.team_members tm_coach
        JOIN public.team_members tm_player
          ON tm_player.team_id = tm_coach.team_id
        WHERE tm_coach.user_id = auth.uid()
          AND tm_coach.role = 'coach'::app_role
          AND tm_player.role = 'player'::app_role
          AND tm_player.player_id = o.player_id
      )
    );
$$;
REVOKE ALL ON FUNCTION public.coach_player_payment_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_player_payment_status(uuid) TO authenticated;