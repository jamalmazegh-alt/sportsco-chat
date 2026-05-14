# Clubero — Role Matrix

Effective access matrix after Phase 4 hardening. RLS is the source of truth — this document mirrors `public.*` policies.

## Roles

| Role | Source | Scope |
|---|---|---|
| `super_admin` | `super_admins` table | Platform‑wide (support / DPO ops) |
| `admin` | `club_members.role = 'admin'` | One club |
| `dirigeant` | `club_members.role = 'dirigeant'` | One club, restricted writes |
| `coach` | `club_members.role = 'coach'` + `team_members` | Their assigned teams |
| `parent` | `player_parents.parent_user_id` | Their children only |
| `player` | `players.user_id` | Themselves |

## Visibility matrix

| Resource | super_admin | club admin | coach | parent | player | other |
|---|---|---|---|---|---|---|
| Club profile | RW | RW | R | R (own club) | R (own club) | — |
| Team roster | R | RW | RW (assigned) | R (child's team) | R (own team) | — |
| Player PII (email, phone) | R | RW | R (assigned team) | RW (own child) | RW (self) | — |
| Player photo (minor) | R | R if `media_consent_status='granted'` | same | RW (own child) | — | — |
| `player_parents` | R | R (club) | R (club) | R (self only) | — | — |
| Events / attendance | R | RW | RW | R (child) | RW (self attendance) | — |
| Messages | — | within conversations | within conversations | within conversations | within conversations | — |
| `user_consents` | R | — | — | R (own + on behalf of child) | R (own) | — |
| `audit_logs` | R | R (club) | — | — | — | — |
| Data export / deletion requests | R | — | — | R (own) | R (own) | — |

R = read, RW = read+write, — = no access.

## Hardening notes (Phase 4)

- `player_parents` SELECT is no longer "any club member"; it is now `(self parent) ∪ (admin/coach of the player's club) ∪ super_admin`. Other parents and players cannot enumerate other families.
- `super_admin` is a separate table, never a column on `profiles`. Checked via `has_super_admin(uid)`.
- All role checks go through `SECURITY DEFINER` helpers (`has_club_role`, `is_club_member`, `has_super_admin`, `is_parent_of_player`, `can_view_player_media`) — never inline `EXISTS` against `club_members` from a policy that is itself on `club_members` (avoids recursion).

## Adding a new role

1. Extend `app_role` enum (migration).
2. Add a `has_<role>` helper if needed.
3. Update each table's policies explicitly — never rely on a default.
4. Update this file and `data-map.md`.
