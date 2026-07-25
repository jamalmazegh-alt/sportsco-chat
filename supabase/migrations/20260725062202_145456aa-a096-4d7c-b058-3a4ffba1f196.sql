select pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conname = 'pub_aud_shape_chk'
  and conrelid = 'public.club_publication_audiences'::regclass;

select proname, left(pg_get_functiondef(oid), 2500) as function_def
from pg_proc
where oid = 'public.create_publication_atomic(uuid, public.publication_type, text, text, public.poll_visibility, boolean, boolean, text, timestamptz, uuid, jsonb, jsonb, jsonb, jsonb, jsonb)'::regprocedure;