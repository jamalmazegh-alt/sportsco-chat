select pg_get_constraintdef(oid) as constraint_def,
       position('staff_equipe' in pg_get_constraintdef(oid)) > 0 as allows_staff_equipe
from pg_constraint
where conname = 'pub_aud_shape_chk'
  and conrelid = 'public.club_publication_audiences'::regclass;