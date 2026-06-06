# E2E test fixtures — one-time setup

The E2E suite runs without `SUPABASE_SERVICE_ROLE_KEY` (Lovable Cloud doesn't
expose it to CI). Instead, every test acts as one of **4 pre-created E2E
users** inside a **pre-created E2E club**, and all DB operations go through
RLS.

## What you need to create manually (once)

### 1. Create the 4 E2E users

In Lovable Cloud → **Users** → **Add user** (one per role). For each: pick a
strong password, set **email confirmed = true**.

| Role   | Email                       | Password stored in    |
| ------ | --------------------------- | --------------------- |
| admin  | `e2e-admin@clubero.app`     | `E2E_ADMIN_PASSWORD`  |
| coach  | `e2e-coach@clubero.app`     | `E2E_COACH_PASSWORD`  |
| player | `e2e-player@clubero.app`    | `E2E_PLAYER_PASSWORD` |
| parent | `e2e-parent@clubero.app`    | `E2E_PARENT_PASSWORD` |

### 2. Create the E2E test club (admin only)

In Lovable Cloud → **Database** → **SQL Editor**:

```sql
-- Replace <ADMIN_USER_UUID> with the auth user id of e2e-admin
insert into public.clubs (name, created_by)
values ('E2E Test Club', '<ADMIN_USER_UUID>')
returning id;

-- Use the returned club id below
insert into public.club_members (club_id, user_id, roles, role)
values ('<CLUB_ID>', '<ADMIN_USER_UUID>', array['admin'], 'admin');

-- Profile row (most apps already auto-create one)
insert into public.profiles (id, full_name, first_name, last_name)
values ('<ADMIN_USER_UUID>', 'E2E Admin', 'E2E', 'Admin')
on conflict (id) do nothing;
```

### 3. Add the 3 other users to the club

After creating the coach/player/parent users in step 1, run:

```sql
-- Coach
insert into public.club_members (club_id, user_id, roles, role)
select c.id, u.id, array['coach'], 'coach'
from public.clubs c, auth.users u
where c.name = 'E2E Test Club'
  and u.email = 'e2e-coach@clubero.app';

-- Player
insert into public.club_members (club_id, user_id, roles, role)
select c.id, u.id, array['player'], 'player'
from public.clubs c, auth.users u
where c.name = 'E2E Test Club'
  and u.email = 'e2e-player@clubero.app';

-- Parent
insert into public.club_members (club_id, user_id, roles, role)
select c.id, u.id, array['parent'], 'parent'
from public.clubs c, auth.users u
where c.name = 'E2E Test Club'
  and u.email = 'e2e-parent@clubero.app';

-- Profile rows for the 3 new users (idempotent)
insert into public.profiles (id, full_name, first_name, last_name)
select u.id,
       initcap(split_part(u.email, '@', 1)),
       initcap(split_part(split_part(u.email, '@', 1), '-', 2)),
       'E2E'
from auth.users u
where u.email in (
  'e2e-coach@clubero.app',
  'e2e-player@clubero.app',
  'e2e-parent@clubero.app'
)
on conflict (id) do nothing;
```

> Per-suite teams, players, events, and `player_parents` links are created
> fresh by `createTestClub` (in `club.ts`) and torn down in `afterAll`. You
> do **not** need to pre-create any team / player / event rows manually.

### 4. Add GitHub Actions secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New secret**:

| Secret name           | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| `SUPABASE_URL`        | your `VITE_SUPABASE_URL`                               |
| `SUPABASE_ANON_KEY`   | your `VITE_SUPABASE_PUBLISHABLE_KEY`                   |
| `E2E_BASE_URL`        | preview URL, e.g. `https://sportsco-chat.lovable.app`  |
| `E2E_ADMIN_EMAIL`     | `e2e-admin@clubero.app`                                |
| `E2E_ADMIN_PASSWORD`  | password from step 1                                   |
| `E2E_COACH_EMAIL`     | `e2e-coach@clubero.app`                                |
| `E2E_COACH_PASSWORD`  | password from step 1                                   |
| `E2E_PLAYER_EMAIL`    | `e2e-player@clubero.app`                               |
| `E2E_PLAYER_PASSWORD` | password from step 1                                   |
| `E2E_PARENT_EMAIL`    | `e2e-parent@clubero.app`                               |
| `E2E_PARENT_PASSWORD` | password from step 1                                   |

`SUPABASE_SERVICE_ROLE_KEY` is **not** required.

## How it works

- `playwright.config.ts` runs `_fixtures/global-setup.ts` once before any test.
- `global-setup.ts` signs in all 4 users in parallel, stores each user's
  access token + user id in `process.env.E2E_<ROLE>_*`, and resolves the
  club id.
- `_fixtures/admin.ts` creates a synchronous Supabase client that attaches
  the admin's token as `Authorization: Bearer …` on every request. All
  `.from(...)` calls go through RLS as the admin.
- `_fixtures/auth.ts` exposes `clientFor({ email, password })` which signs
  in any of the 4 users and returns their own Supabase client (for tests
  that want to assert behaviour under RLS as a non-admin).
- `_fixtures/club.ts` references the pre-existing club and creates only
  per-suite scoped rows (team, players, event, parent link), cleaned up in
  `afterAll`. The coach/player/parent slots are wired to the real users
  from step 1.

## Fallback behaviour

If the coach/player/parent env vars are not set, the fixture falls back to
using the admin user for those slots and logs a warning. Role-boundary
tests (e.g. "a coach cannot do X") won't be meaningful in that case —
gate them with `HAS_MULTI_ROLE_USERS` from `_fixtures/admin.ts`:

```ts
import { HAS_MULTI_ROLE_USERS } from "./_fixtures/admin";

test.describe("Coach permissions", () => {
  test.skip(!HAS_MULTI_ROLE_USERS, "Requires distinct coach/admin users");
  // ...
});
```

## Known limitation

`auth.admin.*` APIs (createUser / listUsers / deleteUser) still require
`service_role`, so test `01-onboarding-club` (UI signup flow that asserts
on `auth.users`) remains skipped via `HAS_ADMIN_PRIVILEGES`.
