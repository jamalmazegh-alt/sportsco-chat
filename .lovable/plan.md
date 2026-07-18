# Migration email provider — Phase 1 uniquement

Principe directeur : **aucun changement de comportement observable**. À la fin de la Phase 1, `EMAIL_PROVIDER=lovable` (défaut) doit produire exactement le même flux qu'aujourd'hui. Le nouveau sender existe, compile, est testé, mais n'est pas encore activé.

Les phases 2 (DNS), 3 (idempotence), 4 (bascule progressive), 5 (auth Supabase) et 6 (retrait Lovable) seront traitées dans des tours séparés, avec leur propre plan et leurs propres critères d'acceptation.

## Phase 1 — Livrables

### 1. Schéma DB — colonnes de traçabilité

Migration sur `email_send_log` :

- `provider text` — quel sender a été utilisé (`lovable` | `ses` | `brevo` | …)
- `provider_message_id text` — l'ID retourné par le provider (déjà partiellement présent dans `message_id`, mais on sépare notre clé métier de l'ID provider)

Aucun backfill, aucune contrainte NOT NULL : les anciennes lignes restent avec ces colonnes à `NULL`. Le superadmin `email-dispatches` affichera ces colonnes quand elles sont renseignées.

### 2. Interface `EmailSender`

Nouveau fichier `src/lib/email/senders/types.ts` :

```ts
export interface SendPayload {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}
export interface SendResult {
  providerMessageId: string;
}
export interface EmailSender {
  readonly name: "lovable" | "ses" | "brevo";
  send(payload: SendPayload): Promise<SendResult>;
}
```

### 3. `LovableSender` — extraction pure, zéro changement

Nouveau fichier `src/lib/email/senders/lovable.ts`. On **déplace** l'appel `@lovable.dev/email-js` actuel (dans `src/routes/lovable/email/queue/process.ts` et `src/routes/lovable/email/transactional/send.ts`) derrière cette classe. Aucun ajustement de retry, de cooldown, de rate-limit, de gestion `recipient_mismatch` : tout reste dans les routes appelantes.

### 4. Squelette `SesSender` (non câblé)

Nouveau fichier `src/lib/email/senders/ses.ts` : classe qui implémente l'interface mais **jette `Error('SES sender not yet configured')`** dans `send()`. On n'ajoute pas encore le SDK AWS ni les secrets — ça viendra en Phase 2/4 quand le compte SES sera prêt. But de Phase 1 : figer le contrat, pas envoyer via SES.

### 5. Sélecteur `getEmailSender()`

Nouveau fichier `src/lib/email/senders/index.ts` :

```ts
export function getEmailSender(): EmailSender {
  const p = process.env.EMAIL_PROVIDER ?? "lovable";
  if (p === "ses") return new SesSender();
  return new LovableSender();
}
```

Lu **à chaque envoi** (pas au boot) pour permettre le flip sans redéploiement une fois la Phase 4 en place.

### 6. Câblage dans les 2 routes d'envoi

- `src/routes/lovable/email/queue/process.ts` : remplace l'appel direct provider par `getEmailSender().send(...)`, log `provider` + `provider_message_id` dans `email_send_log`.
- `src/routes/lovable/email/transactional/send.ts` : idem.

Toute la logique existante (dispatch_id, dédup par `recipient_id`, cooldown 45s, `mismatch_deferred`, DLQ, TTL, cron) reste **strictement identique**.

### 7. Tests

- Test unitaire du sélecteur : `EMAIL_PROVIDER` absent ou `lovable` → `LovableSender` ; `ses` → `SesSender`.
- Test unitaire `SesSender.send()` throw explicite.
- `bun run test` doit rester vert.

### 8. Diff avant/après

À la fin, je te fournis explicitement :

- le diff des deux routes d'envoi (avant : appel direct provider ; après : `getEmailSender().send`)
- la preuve que `EMAIL_PROVIDER=lovable` produit un `email_send_log` identique à aujourd'hui (mêmes statuts, mêmes transitions), avec en plus `provider='lovable'`.

## Hors périmètre de ce tour

- Configuration DNS/SPF/DKIM sur SES (Phase 2 — action manuelle Cloudflare + console AWS).
- Renforcement idempotence au-delà de ce qui existe (Phase 3).
- Toute bascule effective de trafic (Phase 4).
- SMTP custom Supabase Auth (Phase 5).
- Suppression `LovableSender` et du flag (Phase 6).

## Détails techniques

- Le flag est un env var côté serveur (`process.env.EMAIL_PROVIDER`), lu dans les handlers de server routes uniquement. Jamais côté client.
- Pas d'installation de dépendance AWS en Phase 1 : le squelette SES est vide, on ajoute `@aws-sdk/client-sesv2` au moment de Phase 4 pour éviter du poids inutile dans le bundle Worker tant que non utilisé.
- Aucune modification du cron, de la table `email_send_state`, ni des paramètres `transactional_batch_size` / `transactional_send_delay_ms` déjà tunés.
- Aucun changement du superadmin `email-dispatches` en Phase 1 (les nouvelles colonnes seront affichées en Phase 4 quand elles auront de la valeur).

## Critère d'acceptation Phase 1

Avec `EMAIL_PROVIDER` non défini :

1. Un renvoi de convocation sur un event réel produit exactement le même comportement qu'avant (mêmes lignes `email_send_log`, mêmes emails livrés).
2. Les nouvelles lignes ont `provider='lovable'` et `provider_message_id` renseigné.
3. `bun run test` vert.
4. `bun run typecheck` vert.
5. Build production OK.

Je n'entame Phase 2 qu'après ta validation explicite du comportement observé (pas juste des tests verts) sur un vrai burst.
