DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_staff_assignments_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.event_staff_assignments
      ADD CONSTRAINT event_staff_assignments_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;