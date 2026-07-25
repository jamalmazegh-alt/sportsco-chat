DELETE FROM public.club_publications p
WHERE p.publication_type = 'poll'
  AND NOT EXISTS (SELECT 1 FROM public.club_publication_audiences a WHERE a.publication_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.club_poll_options o WHERE o.publication_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.club_publication_dispatches d WHERE d.publication_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.club_publication_recipients r WHERE r.publication_id = p.id);