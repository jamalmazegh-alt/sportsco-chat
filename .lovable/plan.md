## Constat

Beaucoup de contenu reste hardcodé en français même quand l'app est en anglais :
- `src/lib/whatsapp.ts` : tous les messages (convoc, rappel, annulation, report) sont en FR en dur.
- `src/lib/email-templates/convocation-invite.tsx`, `convocation-cancelled.tsx`, `convocation-response.tsx`, `event-rescheduled.tsx` : labels, sujets, `<Preview>`, `lang="fr"` en dur.
- `src/lib/convocation-notify.functions.ts` : date formatée en `fr-FR`.
- `src/routes/_authenticated/events/$eventId.tsx` : "Renvoyer la convocation", dialogue "Renvoyer", toast "Aucune convocation à renvoyer", etc. encore en dur.

La table `profiles` expose déjà `preferred_language` (`'en'` par défaut), donc on peut localiser par destinataire pour les emails, et par utilisateur courant (i18n du navigateur) pour le WhatsApp et l'UI.

## Plan

### 1. WhatsApp (`src/lib/whatsapp.ts`)
- Ajouter un paramètre `locale: 'fr' | 'en'` à toutes les fonctions `buildXxxMessage`.
- Extraire toutes les chaînes (Convocation, Rappel, Présents/Absents/Incertains, Domicile/Extérieur, Composition prévue, XI de départ, Remplaçants, Motif, Reporté, Ancienne/Nouvelle date, Merci de confirmer, envoyé via Clubero, etc.) dans une petite map FR/EN locale au fichier (pas de dépendance à i18next pour rester utilisable côté serveur).
- Format de date via `fmt` avec locale correspondante.

### 2. UI page événement (`src/routes/_authenticated/events/$eventId.tsx`)
- Remplacer les chaînes FR restantes (toasts, dialog "Renvoyer la convocation", bouton "Renvoyer", labels màj) par `t("events.…")`.
- Passer la langue courante (`i18n.language`) aux builders WhatsApp.
- Ajouter les clés correspondantes dans `src/locales/{fr,en}/common.json`.

### 3. Emails (templates + envoi)
- Ajouter `locale?: 'fr' | 'en'` dans les `Props` de :
  - `convocation-invite.tsx`
  - `convocation-cancelled.tsx`
  - `convocation-response.tsx`
  - `event-rescheduled.tsx`
  - `event-cancelled.tsx`
- Dans chaque template : table FR/EN locale, `<Html lang={locale}>`, sujet et preview localisés.
- Dans `convocation-notify.functions.ts` (et les autres endroits qui envoient ces emails) :
  - Lire `profiles.preferred_language` du destinataire.
  - Formater la date avec `fr-FR` ou `en-GB` selon locale.
  - Passer `locale` dans `templateData`.

### 4. Vérification
- `grep` final sur accents/mots FR typiques (`é|è|ê|à|ç|Convoc|Rappel|Présent|Absent`) dans `src/lib/whatsapp.ts`, `src/lib/email-templates/`, et les chaînes JSX du fichier event pour s'assurer qu'il ne reste rien en dur.
- Build TS.

## Hors scope (à confirmer)

- Re-traduction des autres templates email (`signup`, `magic-link`, `invite`, `trial-reminder`, etc.) — beaucoup sont déjà bilingues ou côté Supabase Auth. Je peux faire une passe séparée si tu veux.
- Pages marketing : déjà gérées via `marketing.json`.

Confirme et je l'exécute.
