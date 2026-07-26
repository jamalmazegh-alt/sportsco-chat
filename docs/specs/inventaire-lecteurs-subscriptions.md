# Inventaire — lecteurs de `subscriptions` (Lot 0 bis §28.3)

> Livrable du Lot 0 bis. Question centrale : **un club `coverage_mode='per_team'` peut
> légitimement n'avoir aucune ligne dans `subscriptions`.** Chaque site de lecture doit
> être audité pour vérifier qu'il ne plante pas, et surtout qu'il n'affiche pas un état
> trompeur.
>
> Relevé effectué sur la branche `claude/clubero-equipe-prompt-review-qj3kzf`.
> **39 sites** de lecture ou d'écriture, répartis sur **12 fichiers**.

---

## Résultat principal : aucun risque de crash, deux risques de blocage

**Aucun `.single()` sur `subscriptions` dans tout le dépôt.** Tous les accès unitaires
utilisent `.maybeSingle()`, qui retourne `null` sans erreur. Le risque « écran qui plante
sur club sans ligne » n'existe pas.

En revanche, deux consommateurs traitent « aucune ligne » comme « pas d'accès », et
**verrouillent l'utilisateur**. Ce sont les deux vrais bloquants du chantier.

---

## 🔴 Bloquant n°1 — la garde d'accès verrouille tout le club

**`src/routes/_authenticated.tsx:69-83`**

```tsx
// Guard: clubs without an active subscription only see Admin + Profile.
if (!tournamentOnly && activeClubId && !subLoading && !clubSubActive
    && !isPathAllowed(pathname, CLUB_LOCKED_ALLOWED)) {
  if (!isAdmin) {
    return <LockedClubShell><ClubSubscriptionExpiredScreen … /></LockedClubShell>;
  }
  return <Navigate to="/admin/billing" replace />;
}
```

`clubSubActive` vient de `useClubSubscriptionActive` (`src/lib/use-club-subscription.ts:23`),
qui appelle la RPC `club_has_active_subscription`. Pour un club `per_team` **sans ligne
`subscriptions`**, cette RPC retourne `false`.

**Conséquence : un club en offre Découverte ou Équipe serait intégralement verrouillé dès
sa création.** Les coaches, joueurs et parents verraient l'écran « abonnement expiré » ;
l'admin serait renvoyé vers `/admin/billing`, page conçue pour l'offre Club et qui
n'afficherait aucune souscription.

C'est le point de blocage numéro un du Lot 1 : la nouvelle couverture doit être branchée
**dans cette garde** avant que le moindre club `per_team` puisse exister.

Correction attendue (Phase C, pas avant) :

```text
si coverage_mode = 'club'      → comportement actuel, inchangé
si coverage_mode = 'per_team'  → club ouvert si club_has_any_team_coverage(club_id)
                                 chaque équipe portant ensuite son propre état
```

Note : `use-club-subscription.ts:31-33` retourne `isActive: false` pendant le chargement
et si `clubId` est nul. La garde teste `!subLoading` en amont, donc pas de faux
verrouillage transitoire — comportement correct à préserver.

---

## 🔴 Bloquant n°2 — le mode « tournoi seul » peut capturer un utilisateur `per_team`

**`src/modules/tournaments/hooks/useTournamentOnlyMode.ts:68-72`**

```ts
const tournamentOnly =
  isTournamentOrganizer ||
  (!!data &&
    (data.usedCount > 0 || data.activeEntitlements > 0 || data.activeCollaborations > 0) &&
    data.activeSubs === 0);
```

`activeSubs` compte les lignes `subscriptions` en statut `active` ou `trialing` sur les
clubs de l'utilisateur (`:46-51`). Pour un club `per_team`, ce compte vaut **0**.

**Conséquence :** un coach d'un club `per_team` qui a par ailleurs utilisé un pass
tournoi, possède un entitlement, ou est collaborateur d'un tournoi bascule en mode
« tournoi seul ». Il est alors redirigé vers `/tournaments` et restreint à
`TOURNAMENT_ONLY_ALLOWED` (`_authenticated.tsx:64-66`) — **il ne peut plus atteindre son
équipe**, alors qu'elle est payée.

Le cas n'est pas marginal : c'est exactement le profil « coach qui a organisé un tournoi
l'an dernier et souscrit une offre Équipe cette année ».

Correction attendue : `activeSubs === 0` doit devenir « aucune couverture d'aucune sorte »,
en incluant `team_subscriptions` et les couvertures Découverte.

`collaboratorOnly` (`:74-81`) porte le même `activeSubs === 0`, mais exige aussi
`memberships.length === 0` — un membre de club n'est donc jamais capturé par ce chemin.
Risque nul, à conserver tel quel.

---

## 🟠 Attention — état trompeur en console superadmin

**`src/lib/superadmin.functions.ts`** — 9 sites (`:118`, `:520`, `:623`, `:933`, `:1051`,
`:1193`, `:1548`, `:1860`, `:2174`), plus 5 comptages agrégés (`:2081-2103`).

Aucun ne plante (`maybeSingle` ou requêtes de liste), mais tous présentent un club
`per_team` comme **« sans abonnement »**, ce qui est faux : ses équipes peuvent être
intégralement couvertes.

Les comptages du tableau de bord (`:2086-2103` : total, actifs, `trialing`, `past_due`)
sous-estimeront le parc dès la première équipe payante.

Correction attendue (Lot 3) : colonne « couverture » distinguant `club` / `per_team`, et
agrégats incluant `team_subscriptions`. Non bloquant pour le Lot 1 — c'est de
l'observabilité interne, pas un blocage utilisateur.

---

## 🟢 Sûrs — dégradation propre

| Fichier | Site | Comportement si aucune ligne |
|---|---|---|
| `src/components/trial-banner.tsx` | `:29-39` | `if (!isAdmin \|\| !sub \|\| dismissed) return null` — la bannière disparaît. Correct : un club `per_team` ne doit pas voir de bannière d'essai Club |
| `src/lib/has-paid-access.server.ts` | `:7-10` | `hasPaidAccessFromSubscription(null)` → `false`. Correct pour l'offre Club ; à ne pas réutiliser tel quel pour la couverture Équipe |
| `src/routes/api/public/hooks/trial-reminders.ts` | `:42-44` | Filtre `status = 'trialing'` : les clubs sans ligne sont naturellement exclus. Aucun rappel d'essai Club envoyé à tort |
| `src/modules/tournaments/tournament-payments.server.ts` | `:53-56` | `maybeSingle`, sert de garde de paiement. Se comporte comme « non couvert » — cohérent tant que la création de tournoi reste réservée à l'offre Club |
| `src/lib/stripe-connect.functions.ts` | `:67-70` | `maybeSingle`, garde Stripe Connect. Même remarque |
| `src/lib/billing-exemption.functions.ts` | `:54`, `:96`, `:106` + upsert `:60` | Chemins superadmin, `maybeSingle`. L'upsert crée la ligne au besoin |

---

## ⚙️ Écritures — à ne pas perturber

| Fichier | Site | Nature |
|---|---|---|
| `src/lib/stripe-webhook-handler.server.ts` | `:87` | `upsert(onConflict: "club_id")` — **le cœur de l'invariant R2**. Ne doit être atteint que si `metadata.purpose` est absent |
| `src/lib/billing.functions.ts` | `:164`, `:190`, `:345` | Upserts de synchronisation, tous `onConflict: "club_id"` |
| `src/lib/billing.functions.ts` | `:426`, `:456` | `update` d'annulation et de réactivation, filtrés `eq("club_id", …)` |
| `src/routes/api/public/hooks/trial-reminders.ts` | `:123-125` | `update` du marqueur de rappel, filtré par `id` |

Toutes ces écritures sont `club_id`-scopées et ne touchent jamais un club `per_team`
(qui n'a pas de ligne). Aucune modification requise — **c'est précisément ce qu'il faut
préserver**.

`src/lib/billing.functions.ts` compte par ailleurs 5 lectures de garde (`:97`, `:258`,
`:298`, `:372`, `:400`), toutes en `maybeSingle` et toutes derrière un contrôle « club
admin ». Elles resteront inchangées : la facturation Équipe passe par de nouvelles
fonctions, pas par celles-ci.

---

## Synthèse et suites

| Sévérité | Nombre de sites | Action |
|---|---|---|
| 🔴 Bloquant Lot 1 | 2 | Garde `_authenticated.tsx` et `useTournamentOnlyMode` |
| 🟠 Observabilité | 14 | Console superadmin — Lot 3 |
| 🟢 Sûr | 12 | Aucune action |
| ⚙️ Écriture à préserver | 11 | Aucune action, non-régression à tester |

## Stratégie de test — deux tests, jamais de CI rouge volontaire

Un test unique « qui échoue tant que les bloquants ne sont pas corrigés » banaliserait une
CI rouge pendant toute la Phase A. À proscrire.

**Test de caractérisation (Phase A)** — capture le comportement actuel, passe au vert dès
maintenant :

```text
club coverage_mode='per_team' sans ligne subscriptions, flag désactivé
→ la garde verrouille le club          (comportement historique, documenté)
→ useTournamentOnlyMode capture l'utilisateur si pass/collaboration tournoi
```

Il documente le blocage au lieu de le signaler par un échec, et il détecte toute
modification involontaire du comportement historique pendant les phases A et B.

**Test cible (Phase C)** — activé par le flag, ou après correction :

```text
club coverage_mode='per_team' avec au moins une équipe couverte, flag activé
→ coach, parent et admin accèdent normalement
→ aucun écran ne plante
→ aucun écran n'annonce un abonnement expiré
→ aucune redirection vers /tournaments
```

**Forme recommandée : un seul test paramétré par le flag**, avec les deux jeux
d'assertions. Le passage de l'un à l'autre devient alors la preuve exécutable du
franchissement de la Phase C, et la CI reste verte du début à la fin.
