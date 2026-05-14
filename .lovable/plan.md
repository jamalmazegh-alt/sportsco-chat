## Plan

Large iteration grouped in 6 chunks. I'll do one DB migration, then code in passes.

### 1. Auth UX — password & validation

- **Register / reset-password**: add a "Confirm password" field + live regex helper. Rule: ≥8 chars, 1 uppercase, 1 lowercase, 1 digit. Show the rule to the user with green checkmarks as they type.
- Enable HIBP leaked-password check on Supabase auth.
- Keep email-confirmation ON (already the case) so signup → email verification is required before login.

### 2. App emails (transactional)

Set up Lovable's transactional email infrastructure on `notify.clubero.app` and create templates:
- `player-invite` — sent when admin creates a player (link → `/accept-invite?token=...`)
- `parent-invite` — same for a parent contact
- `event-convocation` — when admin clicks "Send convocations"
- `account-verified` — confirmation

The forgot-password flow already uses Supabase's auth email; we'll brand it via auth email templates (`scaffold_auth_email_templates`).

### 3. Team-scoped invites

New table `member_invites`:
- `id, club_id, team_id, player_id (nullable), parent_for_player_id (nullable), role ('player'|'parent'|'coach'), email, phone, token, expires_at, used_at, created_by, created_at`
- RPC `redeem_member_invite(token)`:
  - links `auth.uid()` to the matching `players.user_id` or `player_parents.parent_user_id`
  - inserts `club_members` row
  - inserts `team_members` row
  - marks invite used

Flow for admin:
1. Create player (form already exists) → on success, if email/phone provided, create invite + send email (and/or SMS depending on club channel config).
2. Same on the parent sub-form.
3. New page `/accept-invite?token=...`: if not logged in → register pre-filled with email; if logged in → call RPC + redirect to `/home`.

### 4. SMS + WhatsApp via Twilio

- Add secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_WHATSAPP_FROM` (optional).
- Server function `sendSms({ to, body })` and `sendWhatsApp({ to, body })` using Twilio REST.
- Server function `sendVerificationCode({ channel, target })` storing 6-digit code in a new `verification_codes` table (5-min TTL, hashed); `verifyCode({ target, code })` consumes it.
- Profile page: "Verify phone" button → modal asks for code → marks `profiles.phone_verified_at`.
- Email verification status comes from `auth.users.email_confirmed_at` (already populated by Supabase) — surface it on profile.
- **Account-active rule**: a player/parent is "active" if `user_id IS NOT NULL` AND (`email_verified` OR `phone_verified`). Show green/orange dot in player & parent lists.

### 5. Club notification channels

Extend `clubs` with `default_channels jsonb default '["email"]'` (admin-editable list, choices: email/sms/whatsapp). New admin screen: Settings → Notifications.

Notification dispatcher (server fn): for each recipient, look up club channels → for each channel, render template → enqueue email / send Twilio SMS or WhatsApp.

### 6. Sports list reorder

Update the sports dropdown source to:
1. Football
2. Basketball
— separator —
Handball, Volleyball, Rugby, Hockey sur gazon, Hockey sur glace, Water-polo, Baseball, Softball, Cricket, Football américain, Football australien, Football gaélique, Lacrosse, Netball, Korfball, Ultimate, Floorball, Sepak takraw, Kabaddi, Polo, Aviron (8), Bobsleigh, Curling.

### Technical notes

- One migration: new tables (`member_invites`, `verification_codes`), new columns (`profiles.phone_verified_at`, `clubs.default_channels`), enums updates, RLS policies, RPCs.
- Twilio called via `createServerFn` (server-only secrets).
- Email templates use the existing transactional pipeline (`send-transactional-email` route).
- Password regex shared in `src/lib/password.ts` and reused in register + reset.
- Sports list moved to `src/lib/sports.ts` (single source).

### Order of execution

1. Migration + auth config (HIBP, channels column)
2. Email infra + templates scaffolding on `notify.clubero.app`
3. Twilio integration + verification code flow
4. Member invite system (RPC + page + send hook in player creation)
5. Password confirm/regex UX + sports list update
6. Account-active indicators on player/parent lists

I'll hand back after each chunk so you can test before I move on. Ready to start with #1 (migration + auth) when you approve this plan.
