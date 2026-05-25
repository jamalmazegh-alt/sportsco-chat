# E2E test fixtures — one-time setup

The E2E suite runs without `SUPABASE_SERVICE_ROLE_KEY` (Lovable Cloud doesn't
expose it to CI). Instead, every test acts as a **pre-created E2E admin user**
inside a **pre-created E2E club**, and all DB operations go through RLS.

## What you need to create manually (once)

### 1. Create the E2E admin user

In Lovable Cloud → **Users** → **Add user** (or via the in-app signup flow):

- **Email:** `e2e-admin@clubero.app` (or any address you control)
- **Password:** a strong password — save it for the GitHub secret below
- **Email confirmed:** yes (toggle "Auto-confirm email" or click the link)

### 2. Create the E2E test club

Either through the app UI (sign in as that user → onboard a club) or via SQL
in Lovable Cloud → **Database** → **SQL Editor**:

```sql
-- Replace <USER_UUID> with the auth user id from step 1
insert into public.clubs (name, created_by)
values ('E2E Test Club', '<USER_UUID>')
returning id;

-- Use the returned club id below
insert into public.club_members (club_id, user_id, role)
values ('<CLUB_ID>', '<USER_UUID>', 'admin');

-- Make sure a profile row exists too (most apps already auto-create one)
insert into public.profiles (id, full_name, first_name, last_name)
values ('<USER_UUID>', 'E2E Admin', 'E2E', 'Admin')
on conflict (id) do nothing;
```

### 3. Add GitHub Actions secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New secret**:

| Secret name           | Value                                                |
| --------------------- | ---------------------------------------------------- |
| `SUPABASE_URL`        | your `VITE_SUPABASE_URL`                             |
| `SUPABASE_ANON_KEY`   | your `VITE_SUPABASE_PUBLISHABLE_KEY`                 |
| `E2E_BASE_URL`        | preview URL, e.g. `https://sportsco-chat.lovable.app` |
| `E2E_ADMIN_EMAIL`     | the email from step 1                                |
| `E2E_ADMIN_PASSWORD`  | the password from step 1                             |

`SUPABASE_SERVICE_ROLE_KEY` is **no longer required** and can be removed.

## How it works

- `playwright.config.ts` runs `_fixtures/global-setup.ts` once before any test.
- `global-setup.ts` signs in the admin user, stores the access token in
  `process.env.E2E_ADMIN_ACCESS_TOKEN`, and resolves the club id.
- `_fixtures/admin.ts` creates a synchronous Supabase client that attaches
  that token as `Authorization: Bearer …` on every request. All `.from(...)`
  calls go through RLS as the E2E admin.
- `_fixtures/club.ts` no longer creates a fresh club per test — it returns
  references to the pre-existing club and creates only per-suite scoped
  rows (team, players, event), cleaned up in `afterAll`.

## Known limitations

Because we can't call `auth.admin.createUser` / `listUsers` / `deleteUser`
without `service_role`, the following are **skipped** or **degraded**:

- **Test `01-onboarding-club`** is skipped — it signs up a fresh user via UI
  and asserts on `auth.users`, which needs admin auth APIs to clean up.
- **All "role" slots** in `createTestClub` (coach / player1 / player2 /
  parent) point to the same admin user. Tests that strictly assert role
  boundaries (e.g. "a coach cannot do X") are no longer meaningful — they
  should be marked `test.skip` when `HAS_ADMIN_PRIVILEGES === false`.

To restore full multi-user coverage you would either need a `service_role`
key, or pre-create one auth user per role (coach / player / parent) and
expose them through additional `E2E_*_EMAIL` / `E2E_*_PASSWORD` secrets.
