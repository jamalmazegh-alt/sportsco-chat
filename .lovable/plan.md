# Multi-Role Permission System

Large, cross-cutting change spanning DB schema, RLS on many tables, server functions, hooks, and two UI surfaces. I'll deliver it in 5 sequential migrations + code, in this exact order.

## Part 1 — Database (migration 1)

**`club_members.roles text[]`**
- Add `roles text[] not null default '{}'`
- Backfill `UPDATE club_members SET roles = ARRAY[role::text]`
- CHECK: `array_length(roles,1) >= 1 AND roles <@ ARRAY['admin','coach','assistant_coach','staff','tournament_manager']`
- Keep `role` column (deprecated, kept in sync via trigger `role = roles[1]` for back-compat with old RLS reads not yet migrated)
- Add new enum values to `app_role`: `assistant_coach`, `staff`, `tournament_manager` (since `role` column is `app_role`)

**`tournament_members`** — per spec. `user_id references auth.users(id)` (not profiles, per project convention).

**`permission_changes_log`** — per spec, append-only.

## Part 2 — RLS

**Helper functions (SECURITY DEFINER, search_path=public):**
- `has_club_role_v2(_user_id, _club_id, _role text) → boolean` — checks `_role = ANY(roles)`
- `is_tournament_member(_user_id, _tournament_id, _role text)` 
- `is_tournament_admin(_user_id, _tournament_id)` — true if tournament_members.role='tournament_admin' OR (club owner of that tournament with `tournament_manager` or `admin` in club_members.roles)
- `is_tournament_referee_for_match(_user_id, _match_id)`

**Migration strategy:** existing `has_club_role(uid, club, 'admin')` already checks `role` column. I'll update `has_club_role` body to check `_role::text = ANY(roles)` — this transparently migrates every existing policy without touching them. The deprecated `role` column stays in sync via trigger.

**New policies:**
- `tournament_members`: admin RW, staff R, referee self-R, club admin R via tournament's club, public R by token (RPC instead — keep RLS denied, expose `get_tournament_member_by_token` RPC)
- `matches`/`tournament_matches`: add UPDATE policy for referees on assigned matches (score columns only — enforced by checking `assigned_match_ids` membership)
- `permission_changes_log`: club admin R for scope='club', tournament admin R for scope='tournament', superadmin R all, no UPDATE/DELETE

## Part 3 — Server Functions

New file `src/lib/permissions.functions.ts` with the 7 functions. Email invites reuse `sendTransactionalEmail` with existing `player-invite` template (rename context label to "member"). Tournament invite uses `tournament-invite` template.

Hooks (`src/lib/auth-context.tsx`):
- Keep `useActiveRole()` — derive from `roles[]` instead of `role`
- Add `useMyRoles(): string[]` returning the active club's `roles` array

## Part 4 — Club Admin UI

Refactor `src/routes/_authenticated/admin/users.tsx`:
- Tabs: "Club members" (admin/coach/assistant_coach/staff/tournament_manager) vs "Players & Parents" (player/parent — keep current rendering)
- Edit dialog: multi-select checkboxes, validation client-side + server-side
- Invite dialog: same multi-select
- Search + filter chips
- Last-change line from `permission_changes_log`

## Part 5 — Tournament Members UI

Add to existing tournament admin area. Need to locate the tournament admin shell — likely `src/routes/_authenticated/tournaments/...`. I'll add a `MembersManager.tsx` under `src/modules/tournaments/components/` and wire it into the existing tournament tabs.

## i18n
Add ~40 new keys in FR and EN `common.json` under `permissions.*` and `tournamentMembers.*`. Run parity check.

## Constraints respected
- Tournament roles fully separate (own table, own RLS).
- `tournament_manager` club role → `is_tournament_admin()` returns true for that club's tournaments only (helper checks `tournaments.club_id`).
- All mutations log to `permission_changes_log`.
- All new SQL functions: `SECURITY DEFINER SET search_path = public`.
- Existing `has_club_role` body rewritten to read `roles[]`; existing policies untouched.

## Delivery order
1. Migration 1: schema (club_members.roles, tournament_members, permission_changes_log, app_role enum extension, sync trigger, rewrite has_club_role)
2. Migration 2: new RLS helpers + tournament_members/log policies + referee match update policy + public token RPC
3. Code: server fns + hooks
4. Code: club admin UI refactor
5. Code: tournament members UI + i18n + parity check

This is ~5–7 hours of work compressed; I'll execute it tightly without intermediate confirmations between migrations.
