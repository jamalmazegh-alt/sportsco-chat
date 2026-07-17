# Plan

## 1. Push manquant lors du renvoi d'une convocation

**Cause** : dans `src/routes/_authenticated/events/$eventId.tsx` (fonction de renvoi de convocation, ~L1958), on insère les notifications in-app + on envoie les emails, mais aucun push web n'est déclenché. `push_dispatch_log` confirme : zéro entrée pour l'événement Espanyol Barcelone. Adam a un push subscription actif, mais rien ne l'a alimenté.

**Fix** : après l'insertion des notifications, appeler une server function push dédiée au renvoi.

- Ajouter dans `src/lib/push-dispatch.functions.ts` une nouvelle server fn `pushConvocationResend({ eventId, playerIds, changedFields })` qui :
  - Charge event + players + parents (même logique que `pushConvocationNew`)
  - Respecte le gate `convocation_on_create` (le renvoi est un update de convocation)
  - Envoie un push avec titre `🔄 Convocation mise à jour` si `changedFields.length > 0`, sinon `🔄 Convocation renvoyée`, body = même format que pour un new (équipe + date + venue)
  - Log dans `push_dispatch_log` avec `kind='convocation_resend'`, `ref_id=eventId`
- Dans `$eventId.tsx`, après `plan.inAppUserIds` insert et avant le `Promise.allSettled(sends)` email, appeler la fn (fire-and-forget avec catch silencieux) en passant `playerIds` = joueurs concernés par le renvoi et `changedFields`

## 2. Dashboard superadmin — statut des invitations par club

**Objectif** : pour chaque club, lister les membres invités avec le statut de l'invitation ET l'état email (envoyé/échec/DLQ/suppressed/accepté).

**Sources de données** :
- `member_invites` (token, email, role, accepted_at, expires_at, club_id, invited_player_id)
- `email_send_log` (statut par `message_id`) → dedup par `message_id` (règle du guide)
- Corrélation invite ↔ email : les invites parents/joueurs utilisent `idempotencyKey` construit dans l'import → il faut retrouver la ligne email via `recipient_email` + `template_name in ('player-invite', 'convocation-invite')` + fenêtre temporelle proche du `created_at` de l'invite. Alternative plus robuste : stocker le `message_id` dans une nouvelle colonne `member_invites.email_message_id` remplie lors du `createInviteAndEmail`. Je vais **ajouter cette colonne** dans une migration, et la remplir côté code — corrélation exacte, plus de fuzzy match.

**Server function** :
- `src/lib/superadmin/invite-status.functions.ts` — `listClubInviteStatuses({ clubId })` (protégée par `requireSupabaseAuth` + check `has_role(_, 'superadmin')`)
- Retourne pour chaque `member_invites` : `{ inviteId, email, role, invitedPlayerName, expiresAt, acceptedAt, emailStatus: 'sent'|'failed'|'dlq'|'suppressed'|'pending'|'none', emailError, emailSentAt }`

**Route/UI** :
- Route `src/routes/_authenticated/superadmin/clubs/$clubId/invites.tsx`
- Tableau : Membre / Email / Rôle / Statut invite (En attente / Acceptée / Expirée) / Statut email (badge coloré) / Date envoi / Erreur (si failed)
- Filtres : statut email, statut invite
- Bouton "Renvoyer" par ligne (réutilise le path existant `createInviteAndEmail`)
- Lien depuis la page club superadmin existante

**Migration** :
- `ALTER TABLE member_invites ADD COLUMN email_message_id text` + index sur `(club_id, email_message_id)`

## 3. Tests

- Test unitaire sur la corrélation invite ↔ email_send_log (via message_id)
- `bun run test` doit rester vert (642+)

## Fichiers touchés (résumé technique)

- `src/lib/push-dispatch.functions.ts` — nouvelle fn `pushConvocationResend`
- `src/routes/_authenticated/events/$eventId.tsx` — appel push après insertion notifs
- Migration : `ALTER TABLE member_invites ADD email_message_id text`
- `src/lib/superadmin-import/import.functions.ts` (et autres call sites de `createInviteAndEmail`) — persister le `messageId` dans `member_invites.email_message_id`
- `src/lib/superadmin/invite-status.functions.ts` — nouvelle server fn
- `src/routes/_authenticated/superadmin/clubs/$clubId/invites.tsx` — nouvelle page
- Lien vers cette page depuis la page club superadmin existante
- `src/tests/unit/*` — tests corrélation

Ok pour ce découpage ?
