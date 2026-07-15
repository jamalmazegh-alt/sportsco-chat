# Visibilité de la liste des convoqués — plan

Livraison en **2 lots séparés**. Le lot A ne merge que quand la matrice RLS est verte et le diff policy avant/après montré. Le lot B ne merge qu'après A.

Ligne de fracture : tout ce qui **décide qui voit quoi** → lot A. Tout ce qui est **cosmétique** (champ UI, i18n, badge) → lot B. Le PDF, les compositions et les compteurs agrégés vont en **A** — ce sont des consommateurs de données, pas de la présentation.

---

## Lot A — Mur porteur (sécurité)

### A.1 Migration schéma

Nouvelle migration `supabase/migrations/<ts>_call_up_visibility.sql` :

- `clubs.show_called_up_players_default boolean not null default true`
- `teams.show_called_up_players_override boolean null default null`
- `events.show_called_up_players_override boolean null default null`

Nullables préservés pour l'héritage. Aucun événement existant ne change de comportement (défaut club = `true`).

### A.2 Fonction source de vérité unique

```sql
create or replace function public.call_up_list_visible(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(
      e.show_called_up_players_override,
      t.show_called_up_players_override,
      c.show_called_up_players_default)
     from public.events e
     join public.teams t on t.id = e.team_id
     join public.clubs c on c.id = t.club_id
     where e.id = p_event_id),
    false
  );
$$;
```

`grant execute` à `authenticated` et `anon` (route publique `r.$token`). Owner : `postgres`. Jamais NULL. Événement introuvable → `false`. `events.club_id` non utilisé (le schéma actuel n'a que `events.team_id`, FK NOT NULL vers `teams`).

### A.3 Policy RESTRICTIVE — `convocations` (SELECT)

Table cible du spec (`call_ups` → `convocations` dans ce projet). Policy permissive actuelle `convocations_select` conservée. Ajout :

```sql
create policy "convocations_visibility_gate"
on public.convocations
as restrictive
for select
to authenticated
using (
  is_team_staff_of_event(event_id, (select auth.uid()))
  or public.call_up_list_visible(event_id)
  or player_id in (select id from public.players where user_id = (select auth.uid()))
  or player_id in (select player_id from public.player_parents where parent_user_id = (select auth.uid()))
);
```

- `is_team_staff_of_event` = helper SECURITY DEFINER dérivant `events.team_id → teams.club_id`. Renvoie `true` pour admin club / coach équipe / assistant.
- Parents : uniquement via `player_parents` officielle. Jamais email/téléphone/nom.
- `(select auth.uid())` systématique.
- Le staff, self et parent-lié passent **même quand la liste est masquée** → aucune écriture n'est cassée (les policies UPDATE `convocations_player_respond` / `convocations_coach_write` relisent la ligne via la même SELECT + restrictive).

### A.4 Policy RESTRICTIVE — `event_lineups` (SELECT)

Miroir strict : quand la liste est masquée, **aucune ligne de compo** n'est retournée (ni banc, ni titulaire, ni sa propre place — décision figée). Le joueur continue de voir sa `convocation` (répondre). Gating **côté données**, pas côté composant.

```sql
create policy "event_lineups_visibility_gate"
on public.event_lineups
as restrictive
for select
to authenticated
using (
  is_team_staff_of_event(event_id, (select auth.uid()))
  or public.call_up_list_visible(event_id)
);
```

Note produit : le réglage masque roster+compo. La convocation individuelle reste toujours visible au joueur/parent lié. À vérifier dans l'UI du lot B (label clair pour éviter les tickets "je ne vois rien").

### A.5 Audit consommateurs serveur (fix ou vérification)

Chaque item ci-dessous est **vérifié** que sa lecture passe par un client Supabase RLS (pas `supabaseAdmin` sans re-check), et que ses agrégats respectent la nouvelle policy restrictive :

| Fichier | Consomme | Action |
|---|---|---|
| `src/lib/match-sheet/match-sheet.server.ts` | convocations + lineups → PDF | Vérifier RLS (pas admin), sinon re-check `call_up_list_visible` |
| `src/lib/lineup.functions.ts`, `lineup-email.server.ts`, `lineup-email.ts` | event_lineups → email compo | Idem |
| `src/lib/push-fanout.server.ts`, `push-dispatch.functions.ts` | convocations → push | Vérifier destinataires |
| `src/lib/convocation-notify.functions.ts`, `convocation-reminder.functions.ts` | convocations | Idem |
| `src/lib/insights.server.ts` | agrégats stats | Compteurs par event doivent respecter la fonction |
| `src/lib/urgency/*`, `use-convocation-urgencies.ts` | Urgency Center | Idem |
| `src/lib/player-feedback.functions.ts` | ratings/feedback | Vérifier |
| `src/lib/support-view/*` | admin | Impact via role |
| `src/routes/api/public/hooks/event-reminders.ts`, `push/convocation-response.ts` | endpoints publics | Respect token / RLS |
| `src/routes/api/chat.ts` | assistant IA | Ne doit pas fuiter compteurs |
| `src/components/attendance-heatmap.tsx`, `team-attendance-stats.tsx`, `player-attendance-stats.tsx`, `admin-kpis.tsx`, `match-result-card.tsx` | compteurs/heatmap | Ne doivent renvoyer que ce que RLS autorise (déjà OK si passent par supabase browser client) |
| `src/routes/_authenticated/{home,events,events/$eventId,events/$eventId/lineup,follow-ups,stats}.tsx` | pages | Vérifier fallback UI quand fetch retourne 0 lignes |
| `src/routes/superadmin/index.tsx` | superadmin | Roles admin → passent |

Livrable : tableau par fichier avec « lu via RLS user » / « lu via admin, re-check ajouté » / « inchangé ».

### A.6 Tests RLS (bloquants)

Nouveau fichier `tests/rls/call-up-visibility.rls.ts`. Matrice **rôle × visibilité × niveau** :

- Rôles : admin club / coach / assistant / joueur concerné / autre joueur / parent lié / parent non lié / anon.
- Visibilité : visible / masquée (via override event, override team, defaut club).
- Assertions :
  - joueur ne voit pas les pairs (masqué)
  - parent non lié ne voit pas
  - joueur voit toujours **sa** convocation (masqué)
  - parent lié idem
  - joueur peut répondre (UPDATE) sous visibilité masquée
  - parent lié idem
  - compositions invisibles quand masqué (même sa propre place)
  - `call_up_list_visible(uuid_inconnu) = false`, jamais NULL
  - staff / self / parent-lié passent tous via la RESTRICTIVE
  - lecture par UUID connu d'un event masqué d'un autre club → 0 lignes

### A.7 EXPLAIN ANALYZE

Fournir `EXPLAIN (ANALYZE, BUFFERS)` pour :
- SELECT convocations d'un event 30 convoqués (staff / joueur / event masqué)
- SELECT event_lineups (staff / joueur / masqué)
- Comparaison visible vs masqué (surcoût de la function call)

Index à vérifier existent déjà : `convocations(event_id)`, `events(team_id)`, `teams` PK. Créer manquants si besoin.

### A.8 Livrables lot A

- Migration SQL
- Diff policies **avant / après** sur `convocations` et `event_lineups` (listes complètes permissives + restrictives)
- Propriétaire + EXECUTE grants de `call_up_list_visible`
- Résultats `bun run test:rls`, `bun run test`, `bun run typecheck`
- Résultats EXPLAIN
- Tableau consommateurs (A.5)

---

## Lot B — Surface (UX + i18n)

Merge uniquement après A vert.

### B.1 UX

- Édition événement : sélecteur "Visibilité de la liste des convoqués" (3 options : hériter / afficher / masquer). Affiche valeur effective + source ("héritée de l'équipe", "définie pour cet événement").
- Édition équipe : même sélecteur (hériter du club / afficher / masquer).
- Édition club (admin) : toggle par défaut (afficher/masquer).
- Message d'info sur les 3 écrans : « Les événements en héritage suivront les futures modifications du réglage équipe/club. »
- Badge coach sur détail événement quand masqué : `🔒 Liste masquée aux joueurs et aux parents`.
- Distinction stricte code client : `showCalledUpPlayers` (config héritée) ≠ `canViewFullCallUpList` (permission effective, dérivée du résultat serveur, pas recalculée localement).

### B.2 i18n

Clés ajoutées dans `src/locales/{fr,en,de,es,it,nl,pt}/events.json` (ou fichier ad hoc) : options, valeurs effectives, source, message d'info, badge coach.

### B.3 Livrables lot B

- Diff fichiers UI
- Diff locales 7 langues
- `bun run test`, `bun run typecheck`, `bun run check:i18n`

---

## Ce que je NE fais pas

- Pas de filtrage côté client comme mécanisme de sécurité (RLS seule décide).
- Pas de nouvelle policy permissive OR (permissives se combinent OR → toujours plus permissif).
- Pas d'anonymisation partielle des compos pour le MVP.
- Pas de règle "joueur voit sa propre place" — reportée à un réglage produit distinct plus tard.
- Pas d'usage de `events.club_id` (colonne absente / non utilisée pour l'autorisation).

Confirme le plan et je démarre le lot A.
