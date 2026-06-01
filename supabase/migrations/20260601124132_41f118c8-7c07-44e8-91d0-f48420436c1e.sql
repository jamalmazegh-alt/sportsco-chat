ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by uuid,
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pt_parent ON public.payment_transactions(parent_transaction_id);

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS pt_amounts_chk;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT pt_amounts_chk CHECK (
    amount_gross_cents >= 0
    AND amount_net_cents >= -2147483648
    AND refunded_amount_cents >= 0
    AND refunded_amount_cents <= amount_gross_cents
  );