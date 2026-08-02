insert into public.notifications (user_id, type, title, body, link)
select tm.user_id, 'qr_player_joined', '🆕 Nouveau joueur via QR code',
       'Mehdi Malek a rejoint USAG UCKANGE U15 R1. Vérifiez sa fiche.',
       '/players/c5dbc716-6e44-4112-8b73-4397a17e87e2'
from public.team_members tm
where tm.team_id = '174e8a29-22cf-4d95-8c05-1340eb8305da'
  and tm.user_id is not null
  and tm.role in ('coach','admin')
  and not exists (
    select 1 from public.notifications n
    where n.user_id = tm.user_id and n.type = 'qr_player_joined'
      and n.link = '/players/c5dbc716-6e44-4112-8b73-4397a17e87e2'
  );