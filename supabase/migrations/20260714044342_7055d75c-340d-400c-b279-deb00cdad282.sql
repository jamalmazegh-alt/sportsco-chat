-- convocation.sent: once per event when convocations_sent flips false -> true
create or replace function public.log_convocation_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_count int;
begin
  begin
    if coalesce(new.convocations_sent, false) = true
       and coalesce(old.convocations_sent, false) = false then
      select t.club_id into v_club from public.teams t where t.id = new.team_id;
      select count(*) into v_count from public.convocations where event_id = new.id;
      insert into public.product_activity_log
        (club_id, actor_user_id, category, action_type, resource_type, resource_id, status, metadata)
      values
        (v_club, auth.uid(), 'convocation', 'convocation.sent', 'event', new.id, 'success',
         jsonb_build_object('team_id', new.team_id, 'count', v_count));
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_log_convocation_sent on public.events;
create trigger trg_log_convocation_sent
  after update of convocations_sent on public.events
  for each row execute function public.log_convocation_sent();

-- convocation.responded: when status leaves 'pending'
create or replace function public.log_convocation_responded()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
begin
  begin
    if new.status is distinct from old.status and new.status::text <> 'pending' then
      select t.club_id into v_club
        from public.events e
        join public.teams t on t.id = e.team_id
       where e.id = new.event_id;
      insert into public.product_activity_log
        (club_id, actor_user_id, category, action_type, resource_type, resource_id, status, metadata)
      values
        (v_club, auth.uid(), 'convocation', 'convocation.responded', 'convocation', new.id, 'success',
         jsonb_build_object('event_id', new.event_id, 'response', new.status::text));
    end if;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists trg_log_convocation_responded on public.convocations;
create trigger trg_log_convocation_responded
  after update of status on public.convocations
  for each row execute function public.log_convocation_responded();