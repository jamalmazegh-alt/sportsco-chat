CREATE TABLE public.support_ticket_audit (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('user','staff','system')),
  action text not null check (action in ('status_changed','priority_changed','assigned','reply','internal_note','created')),
  from_value text,
  to_value text,
  meta jsonb,
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.support_ticket_audit TO authenticated;
GRANT ALL ON public.support_ticket_audit TO service_role;

ALTER TABLE public.support_ticket_audit ENABLE ROW LEVEL SECURITY;

-- Owner can see audit trail of their own ticket, superadmin can see all
CREATE POLICY "audit: owner or superadmin read"
  ON public.support_ticket_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_audit.ticket_id
      AND t.user_id = auth.uid()
    )
  );

CREATE INDEX support_ticket_audit_ticket_created_idx
  ON public.support_ticket_audit (ticket_id, created_at DESC);