UPDATE public.player_parents
SET parent_user_id = NULL,
    full_name = 'Lucas Ronaldo'
WHERE id = '0cf80309-b931-4c6a-bf39-5a587b8bdc8d'
  AND player_id = 'b8c6442a-3819-4465-98bb-9b3dd69c27bb'
  AND lower(email) = lower('lucas.ronaldo@yopmail.com')
  AND parent_user_id = 'f9850101-8091-44b7-a612-17a5f22481a6';

UPDATE public.member_invites
SET used_at = NULL
WHERE id = '11816de7-490c-41e4-8bea-8040bdd9fcc7'
  AND lower(email) = lower('lucas.ronaldo@yopmail.com')
  AND parent_for_player_id = 'b8c6442a-3819-4465-98bb-9b3dd69c27bb';

UPDATE public.club_members
SET roles = array_remove(roles, 'parent'),
    role = 'admin'::public.app_role
WHERE club_id = 'f9bfb65f-4738-43c0-8819-8025f53c6091'
  AND user_id = 'f9850101-8091-44b7-a612-17a5f22481a6'
  AND role = 'admin'::public.app_role;