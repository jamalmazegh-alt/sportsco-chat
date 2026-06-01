-- ============================================================
-- SEASONS
-- ============================================================
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seasons_dates_chk CHECK (end_date >= start_date),
  CONSTRAINT seasons_label_uniq UNIQUE (club_id, label)
);
CREATE INDEX idx_seasons_club ON public.seasons(club_id);
CREATE UNIQUE INDEX uniq_seasons_current_per_club
  ON public.seasons(club_id) WHERE is_current = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT ALL ON public.seasons TO service_role;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seasons_club_members_read" ON public.seasons FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "seasons_fin_admin_write" ON public.seasons FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

-- ============================================================
-- CLUB PAYMENT SETTINGS
-- ============================================================
CREATE TABLE public.club_payment_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'eur',
  platform_fee_bps integer NOT NULL DEFAULT 0,
  min_partial_amount_cents integer NOT NULL DEFAULT 500,
  helloasso_enabled boolean NOT NULL DEFAULT false,
  helloasso_membership_url text,
  helloasso_fundraising_url text,
  helloasso_shop_url text,
  helloasso_tournament_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cps_fee_chk CHECK (platform_fee_bps BETWEEN 0 AND 5000),
  CONSTRAINT cps_currency_chk CHECK (length(currency) = 3),
  CONSTRAINT cps_min_chk CHECK (min_partial_amount_cents >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_payment_settings TO authenticated;
GRANT ALL ON public.club_payment_settings TO service_role;
ALTER TABLE public.club_payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cps_member_read" ON public.club_payment_settings FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "cps_fin_admin_write" ON public.club_payment_settings FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

-- ============================================================
-- PLAYER GUARDIANS
-- ============================================================
CREATE TABLE public.player_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  is_primary_payer boolean NOT NULL DEFAULT true,
  relation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_guardians_uniq UNIQUE (player_id, user_id)
);
CREATE INDEX idx_pg_user ON public.player_guardians(user_id);
CREATE INDEX idx_pg_player ON public.player_guardians(player_id);
CREATE INDEX idx_pg_club ON public.player_guardians(club_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_guardians TO authenticated;
GRANT ALL ON public.player_guardians TO service_role;
ALTER TABLE public.player_guardians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pg_self_read" ON public.player_guardians FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role));
CREATE POLICY "pg_fin_admin_write" ON public.player_guardians FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role));

-- ============================================================
-- PAYMENT ITEMS
-- ============================================================
CREATE TYPE public.payment_item_type AS ENUM
  ('membership','license','equipment','trip','tournament','fundraising','other');
CREATE TYPE public.payment_provider AS ENUM
  ('stripe','helloasso','cash','cheque','bank_transfer','manual');
CREATE TYPE public.payment_item_status AS ENUM
  ('draft','open','closed','cancelled');

CREATE TABLE public.payment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  type public.payment_item_type NOT NULL,
  title text NOT NULL,
  description text,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  due_date date,
  provider public.payment_provider NOT NULL DEFAULT 'stripe',
  allow_partial boolean NOT NULL DEFAULT false,
  status public.payment_item_status NOT NULL DEFAULT 'open',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pi_amount_chk CHECK (amount_cents >= 0),
  CONSTRAINT pi_currency_chk CHECK (length(currency) = 3)
);
CREATE INDEX idx_pi_club_season ON public.payment_items(club_id, season_id);
CREATE INDEX idx_pi_team ON public.payment_items(team_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_items TO authenticated;
GRANT ALL ON public.payment_items TO service_role;
ALTER TABLE public.payment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pi_member_read" ON public.payment_items FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "pi_fin_admin_write" ON public.payment_items FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

-- ============================================================
-- PAYMENT ASSIGNMENTS
-- ============================================================
CREATE TYPE public.payment_target_kind AS ENUM ('player','team','club');

CREATE TABLE public.payment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_item_id uuid NOT NULL REFERENCES public.payment_items(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  target_kind public.payment_target_kind NOT NULL,
  target_player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
  target_team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pa_target_chk CHECK (
    (target_kind = 'player' AND target_player_id IS NOT NULL AND target_team_id IS NULL)
    OR (target_kind = 'team' AND target_team_id IS NOT NULL AND target_player_id IS NULL)
    OR (target_kind = 'club' AND target_team_id IS NULL AND target_player_id IS NULL)
  )
);
CREATE INDEX idx_pa_item ON public.payment_assignments(payment_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_assignments TO authenticated;
GRANT ALL ON public.payment_assignments TO service_role;
ALTER TABLE public.payment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pa_fin_admin_all" ON public.payment_assignments FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

-- ============================================================
-- PAYMENT OBLIGATIONS
-- ============================================================
CREATE TYPE public.payment_obligation_status AS ENUM
  ('pending','partially_paid','paid','cancelled','exempted','refunded');

CREATE TABLE public.payment_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_item_id uuid NOT NULL REFERENCES public.payment_items(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  payer_user_id uuid,
  amount_due_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  status public.payment_obligation_status NOT NULL DEFAULT 'pending',
  exempted_reason text,
  exempted_by uuid,
  exempted_at timestamptz,
  cancelled_reason text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_amount_chk CHECK (amount_due_cents >= 0),
  CONSTRAINT po_uniq UNIQUE (payment_item_id, player_id, payer_user_id)
);
CREATE INDEX idx_po_payer ON public.payment_obligations(payer_user_id);
CREATE INDEX idx_po_player ON public.payment_obligations(player_id);
CREATE INDEX idx_po_item ON public.payment_obligations(payment_item_id);
CREATE INDEX idx_po_club_status ON public.payment_obligations(club_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_obligations TO authenticated;
GRANT ALL ON public.payment_obligations TO service_role;
ALTER TABLE public.payment_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_fin_admin_all" ON public.payment_obligations FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

CREATE POLICY "po_payer_read" ON public.payment_obligations FOR SELECT TO authenticated
  USING (
    payer_user_id = auth.uid()
    OR (player_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.player_guardians g
      WHERE g.player_id = payment_obligations.player_id AND g.user_id = auth.uid()
    ))
  );

-- ============================================================
-- PAYMENT TRANSACTIONS
-- ============================================================
CREATE TYPE public.payment_tx_status AS ENUM ('pending','succeeded','failed','refunded');

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.payment_obligations(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  method public.payment_provider NOT NULL,
  status public.payment_tx_status NOT NULL DEFAULT 'pending',
  amount_gross_cents integer NOT NULL,
  provider_fee_cents integer NOT NULL DEFAULT 0,
  amount_net_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  external_reference text,
  recorded_by uuid,
  comment text,
  attachment_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pt_amounts_chk CHECK (amount_gross_cents >= 0 AND amount_net_cents >= 0)
);
CREATE INDEX idx_pt_obligation ON public.payment_transactions(obligation_id);
CREATE INDEX idx_pt_club_status ON public.payment_transactions(club_id, status);
CREATE INDEX idx_pt_pi ON public.payment_transactions(stripe_payment_intent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_fin_admin_all" ON public.payment_transactions FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

CREATE POLICY "pt_payer_read" ON public.payment_transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_obligations o
    WHERE o.id = payment_transactions.obligation_id
      AND (
        o.payer_user_id = auth.uid()
        OR (o.player_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.player_guardians g
          WHERE g.player_id = o.player_id AND g.user_id = auth.uid()
        ))
      )
  ));

-- ============================================================
-- RECEIPTS (sequential per club)
-- ============================================================
CREATE TYPE public.receipt_kind AS ENUM ('official','confirmation');

CREATE TABLE public.club_receipt_counters (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.club_receipt_counters TO authenticated;
GRANT ALL ON public.club_receipt_counters TO service_role;
ALTER TABLE public.club_receipt_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crc_fin_admin_read" ON public.club_receipt_counters FOR SELECT TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

CREATE OR REPLACE FUNCTION public.next_receipt_number(_club_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.club_receipt_counters(club_id, last_number) VALUES (_club_id, 0)
  ON CONFLICT (club_id) DO NOTHING;
  UPDATE public.club_receipt_counters
    SET last_number = last_number + 1
    WHERE club_id = _club_id
    RETURNING last_number INTO n;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.next_receipt_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(uuid) TO service_role;

CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.payment_transactions(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.payment_obligations(id) ON DELETE CASCADE,
  receipt_number integer NOT NULL,
  kind public.receipt_kind NOT NULL,
  payer_name text,
  player_name text,
  item_title text,
  amount_gross_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  method public.payment_provider NOT NULL,
  pdf_url text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_number_uniq UNIQUE (club_id, receipt_number)
);
CREATE INDEX idx_pr_obligation ON public.payment_receipts(obligation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_fin_admin_all" ON public.payment_receipts FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

CREATE POLICY "pr_payer_read" ON public.payment_receipts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_obligations o
    WHERE o.id = payment_receipts.obligation_id
      AND (
        o.payer_user_id = auth.uid()
        OR (o.player_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.player_guardians g
          WHERE g.player_id = o.player_id AND g.user_id = auth.uid()
        ))
      )
  ));

-- ============================================================
-- FUNDRAISING
-- ============================================================
CREATE TYPE public.fundraising_status AS ENUM ('draft','active','closed','archived');

CREATE TABLE public.fundraising_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  goal_cents integer NOT NULL,
  collected_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'eur',
  start_date date,
  end_date date,
  provider public.payment_provider NOT NULL DEFAULT 'stripe',
  status public.fundraising_status NOT NULL DEFAULT 'draft',
  cover_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fc_goal_chk CHECK (goal_cents >= 0),
  CONSTRAINT fc_collected_chk CHECK (collected_cents >= 0)
);
CREATE INDEX idx_fc_club ON public.fundraising_campaigns(club_id);

GRANT SELECT ON public.fundraising_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fundraising_campaigns TO authenticated;
GRANT ALL ON public.fundraising_campaigns TO service_role;
ALTER TABLE public.fundraising_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fc_public_read" ON public.fundraising_campaigns FOR SELECT TO anon, authenticated
  USING (status IN ('active','closed'));
CREATE POLICY "fc_member_read_all" ON public.fundraising_campaigns FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));
CREATE POLICY "fc_fin_admin_write" ON public.fundraising_campaigns FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

CREATE TABLE public.fundraising_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fundraising_campaigns(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  donor_user_id uuid,
  donor_name text,
  donor_email text,
  amount_gross_cents integer NOT NULL,
  provider_fee_cents integer NOT NULL DEFAULT 0,
  amount_net_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  method public.payment_provider NOT NULL,
  stripe_payment_intent_id text,
  external_reference text,
  comment text,
  is_anonymous boolean NOT NULL DEFAULT false,
  recorded_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fc2_amounts_chk CHECK (amount_gross_cents >= 0 AND amount_net_cents >= 0)
);
CREATE INDEX idx_fc2_campaign ON public.fundraising_contributions(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fundraising_contributions TO authenticated;
GRANT ALL ON public.fundraising_contributions TO service_role;
ALTER TABLE public.fundraising_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fc2_fin_admin_all" ON public.fundraising_contributions FOR ALL TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role))
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));
CREATE POLICY "fc2_self_read" ON public.fundraising_contributions FOR SELECT TO authenticated
  USING (donor_user_id = auth.uid());

-- ============================================================
-- AUDIT LOG (immutable)
-- ============================================================
CREATE TABLE public.payment_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pal_club ON public.payment_audit_logs(club_id, created_at DESC);
CREATE INDEX idx_pal_entity ON public.payment_audit_logs(entity_type, entity_id);

GRANT SELECT, INSERT ON public.payment_audit_logs TO authenticated;
GRANT ALL ON public.payment_audit_logs TO service_role;
ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.payment_audit_logs_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment_audit_logs is append-only';
END $$;
CREATE TRIGGER payment_audit_logs_no_update
  BEFORE UPDATE OR DELETE ON public.payment_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.payment_audit_logs_immutable();

CREATE POLICY "pal_fin_admin_read" ON public.payment_audit_logs FOR SELECT TO authenticated
  USING (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), club_id, 'admin'::app_role));
CREATE POLICY "pal_fin_admin_insert" ON public.payment_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_club_role(auth.uid(), club_id, 'financial_admin'::app_role));

-- ============================================================
-- STATUS STATE MACHINE
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_obligation_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _obl_id uuid;
  _due integer;
  _paid integer;
  _refunded boolean;
  _current_status payment_obligation_status;
  _new_status payment_obligation_status;
BEGIN
  _obl_id := COALESCE(NEW.obligation_id, OLD.obligation_id);

  SELECT amount_due_cents, status INTO _due, _current_status
  FROM public.payment_obligations WHERE id = _obl_id FOR UPDATE;

  IF _current_status IN ('cancelled','exempted') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount_gross_cents) FILTER (WHERE status = 'succeeded'), 0),
         bool_or(status = 'refunded')
    INTO _paid, _refunded
  FROM public.payment_transactions WHERE obligation_id = _obl_id;

  IF _refunded THEN
    _new_status := 'refunded';
  ELSIF _paid <= 0 THEN
    _new_status := 'pending';
  ELSIF _paid < _due THEN
    _new_status := 'partially_paid';
  ELSE
    _new_status := 'paid';
  END IF;

  IF _new_status <> _current_status THEN
    UPDATE public.payment_obligations
      SET status = _new_status, updated_at = now()
      WHERE id = _obl_id;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER payment_tx_recompute_status
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.recompute_obligation_status();

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER seasons_touch BEFORE UPDATE ON public.seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER cps_touch BEFORE UPDATE ON public.club_payment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pi_touch BEFORE UPDATE ON public.payment_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER po_touch BEFORE UPDATE ON public.payment_obligations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER fc_touch BEFORE UPDATE ON public.fundraising_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Coach helper: paid/unpaid only, NO amounts
-- ============================================================
CREATE OR REPLACE FUNCTION public.coach_player_payment_status(_club_id uuid)
RETURNS TABLE (player_id uuid, payment_item_id uuid, item_title text, is_paid boolean)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT o.player_id, o.payment_item_id, pi.title,
         (o.status = 'paid' OR o.status = 'exempted') AS is_paid
  FROM public.payment_obligations o
  JOIN public.payment_items pi ON pi.id = o.payment_item_id
  WHERE o.club_id = _club_id
    AND (
      public.has_club_role(auth.uid(), _club_id, 'coach'::app_role)
      OR public.has_club_role(auth.uid(), _club_id, 'financial_admin'::app_role)
      OR public.has_club_role(auth.uid(), _club_id, 'admin'::app_role)
    )
$$;
REVOKE ALL ON FUNCTION public.coach_player_payment_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_player_payment_status(uuid) TO authenticated;