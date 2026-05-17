INSERT INTO public.super_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = lower('Jamal.mazegh@gmail.com')
ON CONFLICT (user_id) DO NOTHING;