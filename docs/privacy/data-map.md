# Clubero — Data Map

Inventory of personal data we store, why, retention, and lawful basis under GDPR (Art. 6 / Art. 8 for minors).

## Data categories

| Table | Personal data | Purpose | Lawful basis | Retention |
|---|---|---|---|---|
| `profiles` | name, email, phone, avatar, locale | Account identity, in‑app contact | Contract (Art. 6.1.b) | Account lifetime + 30 d after deletion request |
| `auth.users` | email, hashed password, last sign‑in | Authentication | Contract | Same as `profiles` |
| `players` | first/last name, birth date, photo, jersey #, position | Team management | Legitimate interest of the club; for minors → parental consent (Art. 8) | While player is on a team + 1 season for stats |
| `player_parents` | parent ↔ child link | Parental authority for minors | Legal obligation (parental consent) | While child is a minor + 30 d |
| `club_members` | role in club | Access control | Contract | Membership lifetime |
| `events`, `event_attendance`, `match_lineups` | participation, status | Operations | Legitimate interest | 2 seasons |
| `messages`, `conversations` | message body, sender | Club communications | Contract | 24 months |
| `attachments` | uploaded files | User‑provided media | Consent (media) for minors | Until deletion |
| `audit_logs` | action, actor, target | Security, accountability | Legal obligation (Art. 5.2) | 12 months |
| `user_consents` | consents granted/withdrawn, IP, UA | Proof of consent | Legal obligation | 5 years after withdrawal |
| `consent_versions` | published legal texts | Versioned T&Cs | Legal obligation | Permanent |
| `data_export_requests` | export status, signed URL | Right of access (Art. 15) | Legal obligation | 30 d after fulfilment |
| `account_deletion_requests` | deletion schedule | Right to erasure (Art. 17) | Legal obligation | 30 d grace period, then anonymized |

## Minors

- A user is a **minor** if `players.birth_date` resolves to age < 16 (configurable per locale; FR = 15).
- Minor PII (photo, contact) is gated behind:
  - parental consent recorded in `user_consents.on_behalf_of_player_id`, and
  - role check (admin/coach of the player's club, or the parent themselves).
- Photos honour `players.media_consent_status` (`granted` / `denied` / `pending`). Default = `pending` → photo not displayed.

## Out of scope (we do NOT store)

- Biometrics
- Medical / health data
- Behavioural scoring or AI profiling of minors
- Location tracking outside the explicit event venue

## Subject rights

| Right | How |
|---|---|
| Access (Art. 15) | `/profile/privacy` → "Download my data" |
| Rectification (Art. 16) | Profile / player edit screens |
| Erasure (Art. 17) | `/profile/privacy` → "Delete my account" (30‑day grace) |
| Restriction / Objection | Withdraw consent on `/profile/privacy` |
| Portability (Art. 20) | Export = JSON bundle |
| Complaint | Contact DPO + national DPA (CNIL in FR) |
