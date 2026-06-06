
-- Enums
CREATE TYPE public.support_ticket_status AS ENUM ('open','in_progress','waiting_user','resolved','closed');
CREATE TYPE public.support_ticket_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE public.support_ticket_category AS ENUM ('bug','payment','account','team','event','feature_request','other');

-- Tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 10000),
  category public.support_ticket_category NOT NULL DEFAULT 'other',
  priority public.support_ticket_priority NOT NULL DEFAULT 'normal',
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  context_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  user_unread_count int NOT NULL DEFAULT 0,
  staff_unread_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id, last_activity_at DESC);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status, priority, last_activity_at DESC);

-- Messages
CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user','staff')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  attachment_paths text[] NOT NULL DEFAULT '{}',
  is_internal_note boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Ticket RLS
CREATE POLICY support_tickets_select ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_super_admin(auth.uid()));
CREATE POLICY support_tickets_insert ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY support_tickets_update_super ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_super_admin(auth.uid()))
  WITH CHECK (public.has_super_admin(auth.uid()));

-- Message RLS
CREATE POLICY support_messages_select ON public.support_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (t.user_id = auth.uid() OR public.has_super_admin(auth.uid()))
    )
    AND (NOT is_internal_note OR public.has_super_admin(auth.uid()))
  );
CREATE POLICY support_messages_insert ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (t.user_id = auth.uid() OR public.has_super_admin(auth.uid()))
    )
    AND (NOT is_internal_note OR public.has_super_admin(auth.uid()))
    AND (sender_role = 'user' OR public.has_super_admin(auth.uid()))
  );

-- Activity / unread trigger
CREATE OR REPLACE FUNCTION public.bump_support_ticket_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_internal_note THEN
    UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
    RETURN NEW;
  END IF;
  IF NEW.sender_role = 'user' THEN
    UPDATE public.support_tickets
      SET last_activity_at = now(),
          updated_at = now(),
          staff_unread_count = staff_unread_count + 1,
          status = CASE WHEN status IN ('waiting_user','resolved','closed') THEN 'open'::public.support_ticket_status ELSE status END
      WHERE id = NEW.ticket_id;
  ELSE
    UPDATE public.support_tickets
      SET last_activity_at = now(),
          updated_at = now(),
          user_unread_count = user_unread_count + 1,
          status = CASE WHEN status = 'open' THEN 'in_progress'::public.support_ticket_status ELSE status END
      WHERE id = NEW.ticket_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_bump_support_ticket_activity
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_support_ticket_activity();

CREATE TRIGGER trg_support_tickets_updated
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mark-read RPC
CREATE OR REPLACE FUNCTION public.mark_support_ticket_read(_ticket_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT user_id INTO v_owner FROM public.support_tickets WHERE id = _ticket_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF v_owner = v_user THEN
    UPDATE public.support_tickets SET user_unread_count = 0 WHERE id = _ticket_id;
  ELSIF public.has_super_admin(v_user) THEN
    UPDATE public.support_tickets SET staff_unread_count = 0 WHERE id = _ticket_id;
  END IF;
END $$;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "support_attachments_user_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'support-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "support_attachments_user_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_super_admin(auth.uid()))
  );
CREATE POLICY "support_attachments_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'support-attachments' AND public.has_super_admin(auth.uid()));
