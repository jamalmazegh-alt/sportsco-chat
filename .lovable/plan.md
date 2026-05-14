## GDPR & Privacy Architecture for Clubero

This is a large, multi-area build. Here's how I'd phase it so each chunk is testable. The existing app already has clubs / teams / players / parents / club_members / RLS — I'll extend rather than replace.

### Phase 1 — Database foundations (one migration)

Add what's missing for GDPR. Reuse what exists.

- `consent_versions` — `id, kind, version, locale, content_md, published_at`. Kinds: `terms`, `privacy`, `data_processing`, `media`, `notifications`.
- `user_consents` — `id, user_id, kind, version_id, granted, granted_at, withdrawn_at, ip, user_agent, on_behalf_of_player_id (nullable, for parents consenting for minor)`.
- `players.is_minor boolean generated` (from `birth_date`) + `players.media_consent_status` (denormalized for fast filtering: `granted | denied | pending`).
- `data_export_requests` — `id, user_id, status, requested_at, completed_at, file_url`.
- `account_deletion_requests` — `id, user_id, requested_at, scheduled_for (now()+30d), reason, status, processed_at`.
- `audit_logs` already exists — reuse for consent + privacy events.
- `profiles.notifications_email/push` booleans (or roll into consents).

RLS:
- `user_consents`: user reads their own + parent reads consents they made on behalf of their child. Insert by self only.
- `data_export_requests` / `account_deletion_requests`: owner read/insert; service role processes.
- `consent_versions`: public read.
- Strengthen `players` SELECT: minors' email/phone/photo only visible to (parents of player) ∪ (coaches/admins of that team's club). Achieved via a SECURITY DEFINER `can_view_player_pii(uid, player_id)` + view `players_safe` for others. Existing policy is club-wide — keep for non-PII, restrict PII columns through a view.
- Media (`photo_url`): nulled in `players_safe` when `is_minor AND media_consent_status <> 'granted'`.

Roles: existing `app_role` enum has `admin/coach/parent/player/dirigeant`. Add `super_admin` with platform-wide RLS bypass via `has_super_admin(uid)` helper backed by a `super_admins` table (single source of truth, no role on profile).

### Phase 2 — Server functions (`createServerFn`)

- `recordConsent({ kind, version_id, granted, on_behalf_of_player_id? })`
- `withdrawConsent({ consent_id })`
- `requestDataExport()` — enqueues; worker generates JSON of user's data + their minor children + writes to `attachments` bucket private path, signed URL stored.
- `requestAccountDeletion({ reason? })` — soft-schedules in 30 days, sends confirmation email, anonymizes on processing (replace name/email with `deleted-user-<uuid>`, null PII, keep aggregated stats).
- `exportMyData` worker route under `/api/public/cron/process-privacy-requests` (signed).
- `getConsentStatus()` — returns missing/outdated consents to drive onboarding gate.

### Phase 3 — Privacy UX

- **Onboarding consent gate**: after signup (and after each consent version bump), block app shell with a modal listing required consents (Terms, Privacy, Data processing) + optional (Media, Notifications). Stored via `recordConsent`.
- **Parent flow for minors**: when a parent creates/edits a minor player, sub-form requires parental consent for: data processing, media, notifications. Persist with `on_behalf_of_player_id`.
- **Privacy settings page** `/profile/privacy`:
  - current consents with toggle (granted/withdrawn)
  - per-child consent management (parents only)
  - download my data button → triggers export request
  - delete my account button → confirmation modal → schedules deletion
  - consent history table (read-only audit)
- **Player card / lists**: photos respect `media_consent_status`. Use `players_safe` view in non-admin contexts.

### Phase 4 — Role hardening

- Add `super_admins` table + `has_super_admin()` helper.
- Audit existing RLS to ensure: parent can only see their own children (already via `player_parents`), coach scoped to assigned teams (already via `team_members`), club admin scoped to their club (already via `has_club_role`). Player role: tighten so they can't see siblings or other parents' contact info — restrict `player_parents` SELECT to (self parent) ∪ (admin/coach of player's club).
- Document role matrix in `docs/privacy.md`.

### Phase 5 — Documentation

- `docs/privacy/data-map.md` — what we store, why, retention, lawful basis.
- `docs/privacy/role-matrix.md`.
- Public `/privacy` and `/terms` routes rendered from `consent_versions` so legal copy lives in DB.

### Out of scope (per your constraints)
No biometrics, no medical fields, no behavioral analytics, no AI profiling of minors. Push/email consent UI exists but no provider wiring beyond what's already in the app.

---

### Suggested execution order

1. Phase 1 migration + linter pass
2. Phase 2 server functions
3. Phase 3 onboarding gate + privacy settings page (biggest UI chunk)
4. Phase 4 role hardening + super_admin
5. Phase 5 docs + legal pages

I'll hand back after each phase so you can test. **Ready to start with Phase 1 (migration) when you approve.** Want me to adjust scope — e.g. skip super_admin for now, or merge phases 1+2 into a single delivery?
