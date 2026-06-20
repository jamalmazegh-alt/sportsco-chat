# Clubero — Matrice Feature → État (bêta V1)

**Source unique de vérité produit pour la bêta.** Toute nouvelle feature
doit recevoir un état dans cette matrice avant d'être exposée.

Légende :
- ✅ **Visible** — disponible en bêta, présentée comme telle sur le site vitrine.
- 🔒 **Masqué** — code en place mais inaccessible UI. Flip de flag → réactivation.
- 🧪 **Beta interne** — accessible aux comptes internes uniquement.
- 🔮 **V2** — reportée. Peut figurer sur la vitrine en section « À venir » (badge, sans CTA actif vers l'app, sans tunnel d'achat).

Tous les masquages sont gérés via `src/config/features.ts` (`isV2(...)`).

**Miroir serveur SQL** : la table `public.app_flags` + la fonction `public.is_v2(_key)` exposent les mêmes flags pour les triggers DB, les fonctions PL/pgSQL et les edge functions (utilisé en sous-PR (b) pour couper l'émission de notifs/emails côté serveur). `app_flags` et `features.ts` doivent rester alignés : tant que les deux sont à `false`, la feature est totalement masquée. Le flip se fait dans les deux sources simultanément (un `UPDATE public.app_flags SET enabled = true WHERE key = '<flag>'` + flip dans `features.ts` + redéploiement).

---

## 1. Vie du club (GARDÉ — à valoriser)

| Feature | État | Flag | Notes |
|---|---|---|---|
| Mur d'équipe / club (publications, réactions, commentaires) | ✅ | — | Central V1 |
| Actualités Facebook intégrées au mur | ✅ | — | Renommé « Actualités du club » partout |
| Fallback FB (bouton « Voir la page Facebook ») | ✅ | — | Obligatoire si fetch échoue |
| Ingestion agnostique à la source (`facebook` / `manual` / `rss` / …) | ✅ | — | Pipeline club-scoped |
| Messagerie d'équipe | ✅ | — | |
| Covoiturage | ✅ | — | Sans dépendance paiement |
| Calendrier | ✅ | — | |
| Convocations · Disponibilités · Présences | ✅ | — | |
| Documents | ✅ | — | |
| Suivi joueur basique (fiche club-scoped) | ✅ | — | Avatar/nom dans convocs/compos/mur |

## 2. Compétitions (GARDÉ — gratuit)

| Feature | État | Flag | Notes |
|---|---|---|---|
| Création tournoi · poules · phases finales · flights | ✅ | — | |
| Gestion équipes · terrains · arbitres | ✅ | — | |
| Saisie résultats · classements automatiques | ✅ | — | |
| Centre de contrôle Jour J | ✅ | — | |
| **Aucun écran de paiement bloquant** | ✅ | — | Même > 8 équipes |

## 3. Groupe A — Réseau social ouvert (MASQUÉ)

| Feature | État | Flag |
|---|---|---|
| Feed global cross-club | 🔒 | `social_network_v2` |
| Découverte joueurs (`/players`) | 🔒 | `public_player_profiles` |
| Profil public joueur (`/p/:slug`) | 🔒 | `public_player_profiles` |
| Profil public coach (`/coach/:slug`) | 🔒 | `public_player_profiles` |
| Suivre / Following (`/following`, `/follow-ups`) | 🔒 | `social_network_v2` |
| Réseau interclubs · mise en relation · networking | 🔒 | `social_network_v2` |
| Recommandations · suggestions de profils | 🔒 | `social_network_v2` |
| LinkedIn du joueur (profil enrichi) | 🔒 | `public_player_profiles` |

## 4. Groupe B — Paiements & collectes (MASQUÉ)

| Feature | État | Flag |
|---|---|---|
| Cotisations (`/payments`, `/payments/family`, `/payments/receipts`) | 🔒 | `payments_v2` |
| Paiement licences | 🔒 | `payments_v2` |
| Stripe Connect (onboarding club) | 🔒 | `payments_v2` |
| Packs payants tournois (`/tournaments/new-from-pass`, `/tournaments/pass-success`) | 🔒 | `payments_v2` |
| Paiement inscription tournoi (`/t/:slug/pay/:registrationId`) | 🔒 | `payments_v2` |
| Tarification présentée comme achetable sur la vitrine | 🔒 | `payments_v2` |
| Collectes / fundraising / cagnottes | 🔒 | `fundraising_v2` |
| Webhooks/fonctions serveur Stripe | ✅ (serveur) | — | Câblés, injoignables UI |
| Cron `payment-reminders` (envoi emails de rappel) | 🔒 | `payments_v2` | Cron répond `200 {skipped:true}` tant que `payments_v2=false` côté `app_flags` (lu via `isV2Server`) |

## 5. V2 — vitrine « À venir » uniquement

| Feature | État | Notes |
|---|---|---|
| Réseau social joueurs · LinkedIn du football · découverte de talents | 🔮 | Section « Bientôt » vitrine, badge « À venir », pas de CTA app |
| Marketplace sportive | 🔮 | idem |
| Paiements & collectes | 🔮 | Teaser tarification autorisé, **pas** de parcours d'achat |
| Championnats / Ligues (multi-journées) | 🔮 | Hors scope total — pas amorcer |
| Page publique championnat enrichie (forme 5 matchs, stats, buteurs…) | 🔮 | Hors scope |

---

## Règles d'or

1. **On masque, on ne supprime pas.** Aucun fichier, clé i18n, server fn ou test RLS n'est retiré.
2. **Aucun accès résiduel** par menu, URL directe, recherche globale, notification, raccourci, deep link, onboarding, ou CTA in-page.
3. **Vitrine** : les features V2 sont autorisées uniquement en section « À venir » dédiée, étiquetées, sans CTA actif vers l'app, sans tunnel d'achat. CTA autorisé : « Être prévenu » / newsletter.
4. **Couture clé** : Vie du club (mur + actus FB, club-scoped) ≠ Réseau social ouvert (cross-club, masqué). Ne pas les confondre.
5. **Flip d'un flag** = réactivation immédiate, zéro refacto.
