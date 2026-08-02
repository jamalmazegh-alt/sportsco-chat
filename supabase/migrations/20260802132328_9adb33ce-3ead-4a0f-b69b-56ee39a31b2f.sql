UPDATE public.club_members
   SET roles = ARRAY['parent'], role = 'parent'
 WHERE user_id = '49a037b3-376d-45ae-bb72-656475e2ab68'
   AND roles @> ARRAY['player']
   AND NOT EXISTS (
     SELECT 1 FROM public.players p
      WHERE p.user_id = public.club_members.user_id
        AND p.club_id = public.club_members.club_id
        AND p.deleted_at IS NULL
   );