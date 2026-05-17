# Retention policy (TTL per table)

This is the source of truth for GDPR Art. 5.1.e (storage limitation).
Automated cleanup runs daily via `pg_cron` against
`/api/public/hooks/data-retention` (secret-protected).

| Table | TTL | Trigger | Enforcement |
|---|---|---|---|
| `audit_logs` | 12 months | `created_at` | automated |
| `superadmin_audit_logs` | 12 months | `created_at` | automated |
| `email_send_log` | 90 days | `created_at` | automated |
| `notifications` | 180 days | `created_at` | automated |
| `event_messages` | 24 months | `created_at` | automated |
| `verification_codes` | 1 day after `expires_at` | expiry | automated |
| `data_export_requests` (fulfilled) | 30 days after `fulfilled_at` | status + date | automated |
| `account_deletion_requests` (completed) | 30 days after `completed_at` | status + date | automated |
| `reminders` | 30 days | `created_at` | automated |
| `user_consents` | 5 years after withdrawal | legal obligation | manual review |
| `consent_versions` | permanent | versioned legal text | n/a |
| `profiles`, `auth.users` | account lifetime + 30 d grace | deletion request | `account_deletion_requests` worker |
| `players`, `player_parents` | end of season + 1 season | manual club action | manual |
| `events`, `convocations`, `match_results`, `event_goals` | 2 seasons | manual | manual |
| `wall_posts`, `wall_comments`, `wall_post_reads` | account lifetime / club lifetime | cascade | cascade on delete |
| `clubs`, `teams`, `club_members`, `team_members` | club lifetime | manual / cascade | cascade on delete |
| `subscriptions` | 7 years (FR fiscal obligation) | n/a | manual archival |
| `club_invites`, `member_invites` | 30 days past `expires_at` | TODO automate | manual |

## Operating notes

- Automated cleanup is idempotent and safe to re-run.
- New tables added later MUST be assigned a TTL in this file before going to prod.
- The cleanup hook is invoked by pg_cron with a shared secret header; see
  `supabase` configuration (`DATA_RETENTION_SECRET`).
- Manual rows (players, events) are the club's responsibility; they can use
  the soft-delete (`deleted_at`) field where present and admins can hard-delete
  on request.

## Subject right interactions

- A pending `account_deletion_requests` row blocks retention purges of that
  user's PII until the grace period elapses, then the worker anonymizes.
- A `withdraw_consent` event flips `user_consents.withdrawn_at`; the row itself
  is kept 5 years as proof of compliance (CNIL guidance).
