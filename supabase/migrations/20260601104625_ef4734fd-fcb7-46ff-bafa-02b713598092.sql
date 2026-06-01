
-- Private bucket for payment receipts (PDF)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Allow club financial admins to manage receipts under <club_id>/...
CREATE POLICY "receipts_fin_admin_all"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND public.has_club_role(
    auth.uid(),
    ((storage.foldername(name))[1])::uuid,
    'financial_admin'::public.app_role
  )
)
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND public.has_club_role(
    auth.uid(),
    ((storage.foldername(name))[1])::uuid,
    'financial_admin'::public.app_role
  )
);

-- Payers / guardians read their own receipts (file naming: <club_id>/<receipt_id>.pdf)
CREATE POLICY "receipts_payer_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND EXISTS (
    SELECT 1
    FROM public.payment_receipts r
    JOIN public.payment_obligations o ON o.id = r.obligation_id
    WHERE r.pdf_url = storage.objects.name
      AND (
        o.payer_user_id = auth.uid()
        OR (
          o.player_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.player_guardians g
            WHERE g.player_id = o.player_id AND g.user_id = auth.uid()
          )
        )
      )
  )
);
