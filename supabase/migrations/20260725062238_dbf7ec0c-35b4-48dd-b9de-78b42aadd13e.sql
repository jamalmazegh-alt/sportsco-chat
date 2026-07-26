select pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conname = 'pub_aud_shape_chk'
  and conrelid = 'public.club_publication_audiences'::regclass;

select position('audience_type IN (''joueurs_equipe'', ''parents_equipe'', ''staff_equipe'')' in pg_get_constraintdef(oid)) > 0 as constraint_allows_staff_equipe
from pg_constraint
where conname = 'pub_aud_shape_chk'
  and conrelid = 'public.club_publication_audiences'::regclass;

select position('group_id,
      team_id' in pg_get_functiondef('public.create_publication_atomic(uuid, public.publication_type, text, text, public.poll_visibility, boolean, boolean, text, timestamptz, uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure)) > 0 as function_uses_physical_column_order;