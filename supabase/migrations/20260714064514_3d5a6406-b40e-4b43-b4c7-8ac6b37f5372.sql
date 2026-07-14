-- Supporting indexes for the anti-joins used by the watchlist function.
create index if not exists idx_teams_club_id on public.teams(club_id);
create index if not exists idx_players_club_id on public.players(club_id);
create index if not exists idx_events_team_id on public.events(team_id);
create index if not exists idx_team_members_team_id on public.team_members(team_id);
create index if not exists idx_member_invites_club_used
  on public.member_invites(club_id, used_at);
create index if not exists idx_events_pending_convocations
  on public.events(team_id)
  where convocations_sent = false;

create or replace function public.superadmin_watchlist_stalled_onboarding(
  p_limit_per_signal int default 50
)
returns table (
  signal text,
  club_id uuid,
  resource_type text,
  resource_id uuid,
  detail jsonb,
  since timestamptz
)
language sql stable security definer set search_path = public as $$
  -- 1. club sans équipe
  ( select 'club_no_team'::text, c.id, null::text, null::uuid,
           jsonb_build_object('club_name', c.name), c.created_at
    from public.clubs c
    where c.archived_at is null
      and coalesce(c.is_personal, false) = false
      and not exists (select 1 from public.teams t where t.club_id = c.id)
    order by c.created_at asc
    limit p_limit_per_signal )
  union all
  -- 2. équipe sans joueur
  ( select 'team_no_player'::text, t.club_id, 'team'::text, t.id,
           jsonb_build_object('team_name', t.name), t.created_at
    from public.teams t
    join public.clubs c on c.id = t.club_id
    where c.archived_at is null
      and coalesce(c.is_personal, false) = false
      and not exists (select 1 from public.team_members tm where tm.team_id = t.id)
    order by t.created_at asc
    limit p_limit_per_signal )
  union all
  -- 3. joueurs mais aucun event
  ( select 'players_no_event'::text, c.id, null::text, null::uuid,
           jsonb_build_object('club_name', c.name), c.created_at
    from public.clubs c
    where c.archived_at is null
      and coalesce(c.is_personal, false) = false
      and exists (select 1 from public.players p where p.club_id = c.id)
      and not exists (
        select 1
        from public.events e
        join public.teams t on t.id = e.team_id
        where t.club_id = c.id
      )
    order by c.created_at asc
    limit p_limit_per_signal )
  union all
  -- 4. event à venir sans convocation envoyée (créé il y a > 1 j)
  ( select 'event_no_convocation'::text, t.club_id, 'event'::text, e.id,
           jsonb_build_object('title', e.title, 'starts_at', e.starts_at),
           e.created_at
    from public.events e
    join public.teams t on t.id = e.team_id
    join public.clubs c on c.id = t.club_id
    where c.archived_at is null
      and coalesce(c.is_personal, false) = false
      and coalesce(e.convocations_sent, false) = false
      and e.starts_at >= now()
      and e.created_at < now() - interval '1 day'
    order by e.created_at asc
    limit p_limit_per_signal )
  union all
  -- 5. invitation envoyée non acceptée après 7 j
  ( select 'invite_not_accepted'::text, mi.club_id, 'member_invite'::text, mi.id,
           jsonb_build_object('team_id', mi.team_id), mi.created_at
    from public.member_invites mi
    join public.clubs c on c.id = mi.club_id
    where c.archived_at is null
      and coalesce(c.is_personal, false) = false
      and mi.used_at is null
      and mi.created_at < now() - interval '7 days'
    order by mi.created_at asc
    limit p_limit_per_signal );
$$;

revoke all on function public.superadmin_watchlist_stalled_onboarding(int)
  from public, anon, authenticated;
grant execute on function public.superadmin_watchlist_stalled_onboarding(int)
  to service_role;