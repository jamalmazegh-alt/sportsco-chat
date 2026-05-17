## Contexte

Le projet a déjà :
- une table `super_admins` + fonction `has_super_admin(uuid)`
- une table `audit_logs` (par club)
- un espace `/admin` réservé aux **club admins** (à ne pas confondre)

Il n'y a aucune UI super admin pour l'instant. Le chantier complet est énorme — je propose de le découper en 4 phases livrables indépendamment. Tu valides phase par phase.

## Découpage proposé

### Phase 1 — Fondations sécurité (à faire en premier)
- Nouvelle route racine `/superadmin/*` (séparée de `/admin` qui reste pour les club admins)
- Layout `_superadmin.tsx` avec `beforeLoad` qui vérifie `has_super_admin` — sinon 404 (pas redirect, pour ne pas révéler l'existence)
- Server functions dédiées (`src/lib/superadmin.functions.ts`) avec middleware qui re-vérifie le rôle côté serveur sur chaque appel
- Table `superadmin_audit_logs` (séparée de `audit_logs` qui est scopée par club) — chaque action sensible journalisée
- Navigation latérale interne (Dashboard / Clubs / Users / Billing / Logs / Support / Settings)
- Design "operational SaaS" (sidebar dense, monospace pour IDs, badges de statut)

### Phase 2 — Dashboard + Clubs + Users (lecture seule)
- **Dashboard** : compteurs (clubs total/actifs, users, abonnements actifs/trial, expirations 7j, events, convocations envoyées), feed d'activité récente
- **Clubs** : liste paginée + recherche + filtres (statut sub, pays plus tard, date création), détail club (owner/admins, équipes, sub Stripe, settings en lecture)
- **Users** : recherche globale (email/nom/téléphone), filtre par rôle, détail user (clubs liés, joueurs liés, dernière connexion)
- **Billing** : vue agrégée des subscriptions Stripe (statut, plan, trial_end, current_period_end, cancel_at)

### Phase 3 — Actions sensibles
- Désactiver / réactiver un user (via Supabase Admin API)
- Archiver un club (soft delete)
- Reset password link pour un user
- Chaque action → entrée dans `superadmin_audit_logs`

### Phase 4 — Impersonation + Logs + Support
- **Impersonation** : génération d'un magic link scoped au club (ou JWT court côté server) qui ouvre l'app en tant que club admin
  - Bannière rouge fixe "🛡️ Mode impersonation — Sortir" visible partout
  - Session impersonation expire en 1h
  - Log entrée/sortie + toutes les actions effectuées
- **Activity Logs** : visualisation des `superadmin_audit_logs` + `audit_logs` clubs, filtrable
- **Support tools** : depuis le détail club, raccourcis vers events / convocations / wall (lecture seule via impersonation read-only)

## Détails techniques

**Routes** : `/superadmin`, `/superadmin/clubs`, `/superadmin/clubs/$clubId`, `/superadmin/users`, `/superadmin/users/$userId`, `/superadmin/billing`, `/superadmin/logs`, `/superadmin/settings`.

**Sécurité multicouches** :
1. `beforeLoad` route : `has_super_admin` check → 404 si non
2. Middleware server-fn `requireSuperAdmin` : re-check côté serveur, sinon 403 + log de tentative
3. RLS : les server functions utilisent `supabaseAdmin` (service role) pour bypasser RLS quand nécessaire (lecture cross-club), mais chaque handler vérifie d'abord le rôle
4. Impersonation : token JWT signé serveur avec `sub=target_user_id` + `impersonator_id` + exp 1h, stocké en cookie httpOnly

**Audit log** :
```sql
create table superadmin_audit_logs (
  id uuid pk,
  actor_user_id uuid not null,  -- le super admin
  action text not null,         -- 'impersonate_start', 'disable_user', etc.
  target_type text,             -- 'user' | 'club' | 'subscription'
  target_id uuid,
  club_id uuid,                 -- contexte si pertinent
  metadata jsonb,
  ip text, user_agent text,
  created_at timestamptz
);
-- RLS: lecture super admin uniquement, insert via security definer fn
```

**Design** : sidebar fixe gauche fond `--surface-muted`, header compact avec ID projet + env, tableaux denses avec colonnes triables, status pills monochromes (green/yellow/red), font mono pour UUIDs tronqués.

## Hors scope (à confirmer)

- Pas de modification structurelle des données clubs (juste lecture/archive)
- Pas de remboursement Stripe direct (juste affichage — geste manuel via Stripe dashboard)
- Pas de gestion multi-org/team interne CLUBERO (1 niveau de super admin pour V1)
- Pas de 2FA spécifique super admin pour V1 (à ajouter en phase 5 si besoin)

## Question avant de coder

Tu veux que j'enchaîne **Phase 1 + Phase 2** maintenant (foundations + lecture seule, le plus utile au quotidien), ou tu préfères que je fasse uniquement la **Phase 1** d'abord pour valider l'architecture ?