
-- member_invites: log invite.member_sent on insert
create or replace function public.log_member_invite_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.product_activity_log
      (club_id, actor_user_id, category, action_type, resource_type, resource_id, status, metadata)
    values
      (new.club_id, coalesce(auth.uid(), new.created_by), 'invite', 'invite.member_sent',
       'member_invite', new.id, 'success',
       jsonb_build_object('role', new.role, 'team_id', new.team_id));
  exception when others then null; end;
  return new;
end $$;

drop trigger if exists trg_log_member_invite_sent on public.member_invites;
create trigger trg_log_member_invite_sent
  after insert on public.member_invites
  for each row execute function public.log_member_invite_sent();

-- member_invites: log invite.member_accepted when used_at transitions from null to non-null
create or replace function public.log_member_invite_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.used_at is null and new.used_at is not null then
    begin
      insert into public.product_activity_log
        (club_id, actor_user_id, category, action_type, resource_type, resource_id, status, metadata)
      values
        (new.club_id, coalesce(auth.uid(), new.created_by), 'invite', 'invite.member_accepted',
         'member_invite', new.id, 'success',
         jsonb_build_object('role', new.role, 'team_id', new.team_id));
    exception when others then null; end;
  end if;
  return new;
end $$;

drop trigger if exists trg_log_member_invite_accepted on public.member_invites;
create trigger trg_log_member_invite_accepted
  after update of used_at on public.member_invites
  for each row execute function public.log_member_invite_accepted();

-- club_invites: log invite.club_sent on insert
create or replace function public.log_club_invite_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.product_activity_log
      (club_id, actor_user_id, category, action_type, resource_type, resource_id, status, metadata)
    values
      (new.club_id, coalesce(auth.uid(), new.created_by), 'invite', 'invite.club_sent',
       'club_invite', new.id, 'success',
       jsonb_build_object('role', new.role));
  exception when others then null; end;
  return new;
end $$;

drop trigger if exists trg_log_club_invite_sent on public.club_invites;
create trigger trg_log_club_invite_sent
  after insert on public.club_invites
  for each row execute function public.log_club_invite_sent();

-- club_invites: log invite.club_accepted whenever uses_count increases
create or replace function public.log_club_invite_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.uses_count, 0) > coalesce(old.uses_count, 0) then
    begin
      insert into public.product_activity_log
        (club_id, actor_user_id, category, action_type, resource_type, resource_id, status, metadata)
      values
        (new.club_id, auth.uid(), 'invite', 'invite.club_accepted',
         'club_invite', new.id, 'success',
         jsonb_build_object('role', new.role, 'uses_count', new.uses_count));
    exception when others then null; end;
  end if;
  return new;
end $$;

drop trigger if exists trg_log_club_invite_accepted on public.club_invites;
create trigger trg_log_club_invite_accepted
  after update of uses_count on public.club_invites
  for each row execute function public.log_club_invite_accepted();
