## Plan: Squadly admin & event flow improvements

A large set of related improvements across registration, club/team setup, player management, and event creation. I'll group into a coherent migration + UI pass.

### 1. Database migration

Add columns and a new table:

- `profiles`: already has `full_name`. Registration flow will collect first + last and store concatenated `full_name` (+ `first_name`, `last_name` columns).
- `teams`: add `championship text` (optional). `age_group` already exists.
- `players`: add `preferred_position text` (rename usage of existing `position`), `phone text`, `email text`, `photo_url` already exists, `can_respond boolean default true` (whether player can accept convocations).
- `player_parents`: add `phone text`, `email text`, `full_name text`, `can_respond boolean default true`.
- `events`: add `convocation_time timestamptz`, `competition_type text` (friendly/championship/cup), `competition_name text`, `location_url text`. `ends_at` already exists.
- Add `profiles.first_name`, `profiles.last_name`.

### 2. Auth / registration

- `register.tsx`: add First name + Last name fields, store on profile via `handle_new_user` (update trigger to read `first_name` / `last_name` from metadata) and pass them in `signUp` options.

### 3. Teams

- Create form: keep name, add `championship` (optional). Already has age_group, season, sport.

### 4. Players (admin)

- Replace inline `TeamQuickAdd` with: clicking a team navigates to `/teams/$teamId` showing player list with photos and account-active indicator (player has linked `user_id`).
- New route `/teams/$teamId` lists players (avatar, name, jersey, position, account active dot).
- "Add player" sheet with: photo upload, first/last name, jersey, preferred position, phone, email, parent contact (name/phone/email), who can respond (player/parent/both).
- Player detail route `/players/$playerId` for editing same fields.
- Storage bucket `player-photos` (public) for avatars.

### 5. Events

- Form changes:
  - Add **event name** (title) — for trainings default to "Training".
  - Add **convocation time** (datetime), **start time**, **end time**.
  - Location: free text + optional **Google Maps URL**.
  - For `match`: add **competition type** (friendly/championship/cup) and competition name; remove team-name display, show opponent only.
  - **Publish event** vs **Send convocations later**: events default to `published`, but only create convocations + notifications when admin clicks "Send convocations". Add status `convocations_sent boolean` (or use existing convocation rows existence).
- Event card: show event title, not team name.

### 6. Profile / language persistence

- `setLang`: already updates `profiles.preferred_language`. Confirm and ensure on app load we read it (already done in auth context). Make sure UI reflects saved language correctly.

### Technical notes

- All DB changes via one migration.
- Add storage bucket via SQL.
- Adjust `useAuth` to include `first_name` / `last_name` if needed; otherwise just used in profile display.
- Update i18n strings (en + fr) for new labels.
- Keep RLS unchanged (existing policies cover new columns).

### Out of scope (not requested)

- Email/SMS sending of convocations — only in-app notifications continue.
- Real account-invite flow for players — "active" simply means `players.user_id IS NOT NULL`.
