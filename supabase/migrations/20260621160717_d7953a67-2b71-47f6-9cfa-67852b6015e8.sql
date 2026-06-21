
-- 1. Restrict player_parents_select policy to authenticated role only.
DROP POLICY IF EXISTS player_parents_select ON public.player_parents;
CREATE POLICY player_parents_select ON public.player_parents
  FOR SELECT TO authenticated
  USING (
    (parent_user_id = auth.uid())
    OR (EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = player_parents.player_id
        AND (has_club_role(auth.uid(), p.club_id, 'admin'::app_role)
          OR has_club_role(auth.uid(), p.club_id, 'coach'::app_role))
    ))
    OR has_super_admin(auth.uid())
  );

-- 2. Revoke column-level SELECT on Stripe identifier columns from anon/authenticated.
-- service_role keeps full access (GRANT ALL).
REVOKE SELECT (stripe_payment_intent_id, stripe_subscription_id, stripe_customer_id, stripe_session_id)
  ON public.tournament_entitlements FROM authenticated, anon;

REVOKE SELECT (stripe_payment_intent_id, stripe_session_id)
  ON public.tournament_passes FROM authenticated, anon;

REVOKE SELECT (stripe_payment_intent_id, stripe_session_id, stripe_charge_id, payment_intent_id, platform_fee, payment_link)
  ON public.tournament_registrations FROM authenticated, anon;
