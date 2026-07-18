-- No-op safety: nothing to migrate, but re-align any drift where role isn't in roles.
UPDATE public.club_members
SET roles = roles
WHERE role::text <> ALL(roles);