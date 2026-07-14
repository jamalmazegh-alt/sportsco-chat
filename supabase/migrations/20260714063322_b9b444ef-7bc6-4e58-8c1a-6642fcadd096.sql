create or replace function public.superadmin_club_activity_summary()
returns table (
  club_id uuid,
  last_activity_at timestamptz,
  last_action_type text,
  count_7d bigint,
  count_30d bigint
)
language sql stable security definer set search_path = public as $$
  select
    p.club_id,
    max(p.created_at) as last_activity_at,
    (array_agg(p.action_type order by p.created_at desc))[1] as last_action_type,
    count(*) filter (where p.created_at > now() - interval '7 days') as count_7d,
    count(*) filter (where p.created_at > now() - interval '30 days') as count_30d
  from public.product_activity_log p
  where p.club_id is not null
  group by p.club_id;
$$;

revoke all on function public.superadmin_club_activity_summary() from public, anon, authenticated;
grant execute on function public.superadmin_club_activity_summary() to service_role;