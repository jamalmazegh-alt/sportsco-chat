
# Refocus Bêta V1 — Plan d'exécution

Objectif : masquer (jamais supprimer) tout ce qui relève de V2 derrière 4 feature flags, et aligner site vitrine ↔ app ↔ produit. Vie du club (mur, actus FB, covoiturage, messagerie, compétitions gratuites) reste pleinement visible.

## 1. Source de vérité : flags

Créer `src/config/features.ts` :

```ts
export const V2_FLAGS = {
  social_network_v2: false,
  public_player_profiles: false,
  fundraising_v2: false,
  payments_v2: false,
} as const;
export const isV2 = (f: keyof typeof V2_FLAGS) => V2_FLAGS[f];
```

Aucun code n'est supprimé. Tout gating passe par `isV2(...)`.

## 2. Audit & matrice (livrable)

Avant de toucher au code, produire `docs/beta-v1/feature-matrix.md` : tableau Feature → État (Visible / Masqué / V2 / flag) — référence officielle. Sert de checklist pour l'audit des points d'entrée.

Points d'entrée à auditer systématiquement :
- `src/components/bottom-nav.tsx`, `src/components/assistant-fab.tsx`
- nav admin (`src/routes/_authenticated/admin/*`)
- `src/routes/_authenticated/home.tsx` (dashboard, raccourcis, quick actions)
- `src/routes/_authenticated/profile*.tsx`, `players/$playerId*`
- `src/routes/_authenticated/payments*`, `_authenticated/follow-ups.tsx`, `following.tsx`
- pages publiques `p.$slug.tsx`, `players.tsx`, `coach.$slug.tsx`
- recherche globale (si présente) + sitemap `sitemap[.]xml.ts`
- onboarding (`onboarding.tsx`, redirects)
- notifications (`notifications.tsx`, émetteurs serveur)
- vitrine : `features.tsx`, `pricing.tsx`, `demo.tsx`, `contact.tsx`, `fr.tournois`, `en.tournaments`, `fr.onboarding-club`, `en.club-onboarding`, marketing chat
- composants `src/components/marketing/*`

## 3. Masquage groupe A — réseau social & profils publics

Flags : `social_network_v2`, `public_player_profiles`.

- Nav : retirer entrées "Découvrir", "Réseau", "Following", "Players publics" du bottom-nav et menus.
- Routes : ajouter `beforeLoad: () => { if (!isV2('social_network_v2')) throw redirect({ to: '/home' }); }` sur :
  - `_authenticated/following.tsx`, `_authenticated/follow-ups.tsx`
  - `players.tsx` (liste publique), `p.$slug.tsx`, `coach.$slug.tsx` → redirect `/` + meta `noindex`
- Profil joueur : `players/$playerId.tsx` reste accessible aux membres du club (vue basique), mais désactiver onglets enrichis (achievements, seasons publiques, timeline publique partageable) derrière `public_player_profiles`.
- Sitemap : exclure URLs de profils publics joueurs/coachs.
- Notifications : filtrer côté UI les notifs pointant vers ces routes (passe-plat sans CTA).

## 4. Masquage groupe B — paiements & collectes

Flags : `payments_v2`, `fundraising_v2`.

- Nav : retirer item "Paiements" du bottom-nav (déjà conditionnel via `clubLocked`, mais ajouter masquage global).
- Routes (redirect /home) :
  - `_authenticated/payments.tsx`, `payments.family.tsx`, `payments.receipts.tsx`
  - `t.$slug.pay.$registrationId.tsx` → message "Paiement indisponible en bêta", redirect vers page tournoi
  - `tournaments.pass-success.tsx`, `tournaments.new-from-pass.tsx` → redirect
- Admin : masquer sections billing/Stripe Connect/cotisations dans `_authenticated/admin/*` et `superadmin/billing.tsx`.
- Tournois : forcer parcours d'inscription **gratuit**, même > 8 équipes ; retirer écrans Stripe Connect, packs payants, prix.
- Wall/club : retirer CTA "Créer une collecte", "Cotisations".
- Vitrine : retirer `pricing.tsx` du menu principal (laisser route avec teaser "à venir", pas de CTA achat) ; retirer toute mention "Connecter Stripe".
- Serveur : webhooks Stripe (`api/public/stripe-webhook`, `webhooks/stripe`, fonctions tournament-payments) **restent câblés**. Pas de suppression.

## 5. Mur du club + actus Facebook (à valoriser)

- Renommer dans i18n (7 langues) toute formulation "réseau social" / "social feed" / "social network" liée à l'intégration FB → **"Actualités du club"** / "Club news". Garder les clés, modifier les valeurs.
- Vérifier fallback FB : si fetch échoue, afficher bouton "Voir la page Facebook du club" (URL stockée) au lieu d'écran vide.
- Confirmer champ `source` sur items du mur (extensible : facebook/manual/rss). Si absent, ajouter migration légère ; sinon documenter.

## 6. Site vitrine — repositionnement 3 piliers

Refonte `src/routes/features.tsx` et composants marketing autour de :
1. **Gestion du club** (matchs, entraînements, convocations, présences, documents, covoiturage)
2. **Communication** (mur, actualités club, FB, messagerie)
3. **Compétitions** (tournois, poules, phases finales, terrains, arbitres, classements)

Section séparée **"Bientôt"** / "Roadmap" avec badges "À venir" pour :
- Réseau social joueurs · LinkedIn du football · découverte de talents · marketplace · paiements & collectes · championnats/ligues.
- CTA autorisé : "Être prévenu" (newsletter/liste d'attente). Aucun "Essayer", aucun lien vers feature masquée, aucun tunnel d'achat.

Mettre à jour : `features.tsx`, `pricing.tsx` (teaser only, pas de CTA achat), homepage marketing, `fr.tournois`/`en.tournaments`, `fr.onboarding-club`/`en.club-onboarding`, marketing chat (prompt système : ne plus présenter V2 comme disponibles).

Message cœur : *« La solution la plus simple pour gérer un club sportif, organiser des compétitions et centraliser la vie du club. »*

## 7. i18n

- Conserver toutes les clés. Modifier uniquement les valeurs marketing (réseau social → actualités du club ; pricing → "à venir").
- 7 langues : fr, en, de, es, it, nl, pt. Patch via `scripts/i18n-patches/*.json` existants si pertinent.

## 8. Tests

- `.skip` (pas suppression) sur E2E des features masquées :
  - `15-clubero-pack-purchase.e2e.ts`, `21-follows.e2e.ts`, `22-player-public-profile.e2e.ts`
  - parties paiement de `16-tournament-lifecycle.e2e.ts`
- Nouveau smoke : `tests/e2e/beta-v1-masking.e2e.ts` — vérifie redirects routes masquées, absence d'items de nav, absence CTA paiements.
- RLS et unit tests inchangés.

## 9. Definition of Done

- [ ] `src/config/features.ts` créé, 4 flags `false`.
- [ ] Matrice `docs/beta-v1/feature-matrix.md` livrée.
- [ ] Routes V2 → redirect (jamais 404/500).
- [ ] Nav, dashboard, recherche, notifications, deep links purgés.
- [ ] Mur + actus FB OK avec fallback, libellés "Actualités du club".
- [ ] Vitrine : 3 piliers + section "À venir" sans CTA app.
- [ ] Tournois gratuits bout-en-bout.
- [ ] E2E masqués `.skip`, smoke vert.
- [ ] Flip d'un flag = réactivation immédiate, zéro refacto.

## Notes d'exécution

- Scope énorme : je propose de **livrer en 3 PR successives** :
  1. **PR1 — Fondations** : `features.ts`, matrice, gating routes (redirects), masquage nav. C'est ce qui ferme la fuite.
  2. **PR2 — Vitrine** : repositionnement 3 piliers + section "À venir" + marketing chat + i18n.
  3. **PR3 — Tests & polish** : `.skip` E2E, smoke, audit final 6 rôles, fallback FB durci.
- Avant de démarrer PR1, je vais lire en parallèle : `bottom-nav`, `home.tsx`, `features.tsx`, `pricing.tsx`, composants marketing wall/FB, routes paiements & follows pour confirmer les points exacts à gater.

**Question avant exécution** : tu valides ce découpage en 3 PR ? Ou tu veux que je fasse tout en une seule passe (plus long, plus risqué) ?
