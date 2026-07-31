# Plan de migration mobile — Capacitor (iOS + Android)

État : proposition d'architecture, non implémentée.
Contexte : Clubero = TanStack Start (React 19 / Vite 7), SSR + server functions déployées sur Cloudflare Workers, backend Supabase (Auth + Postgres + RLS).

---

## 1. Décision d'architecture

Capacitor embarque un bundle **statique** dans une WebView. Or l'app est aujourd'hui rendue en SSR par un Worker Cloudflare, et 73 fichiers `src/lib/*.functions.ts` exposent des `createServerFn` appelés en RPC sur une URL **relative** (`/_serverFn/<id>`). Dans la WebView l'origine devient `capacitor://localhost` (iOS) ou `http://localhost` (Android) : ces appels partiraient dans le vide.

Trois options :

| Option                                       | Description                                                                                                       | Effort         | Verdict                                                                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. WebView distante**                      | `server.url` Capacitor pointe sur l'URL de prod. Aucun refactor.                                                  | 1–2 j          | Utile pour un pilote TestFlight interne. Risque réel de rejet Apple (guideline 4.2 « minimum functionality »), zéro offline, écran blanc sans réseau. |
| **B. SPA embarqué + Worker en API distante** | Le bundle client est prérendu en SPA et embarqué ; le Worker Cloudflare reste le backend (server fns + `/api/*`). | 3–5 semaines   | **Recommandé.** Une seule base de code, démarrage instantané, natif pour le push/caméra.                                                              |
| C. Réécriture React Native                   | —                                                                                                                 | plusieurs mois | Hors sujet ici.                                                                                                                                       |

**Retenu : option B**, avec option A possible en parallèle comme build de préproduction.

---

## 2. Acquis — ce qui est déjà compatible

- **Auth par bearer token, pas par cookie.** `src/integrations/supabase/client.ts` stocke la session en `localStorage`, et `src/integrations/supabase/auth-attacher.ts` (middleware global déclaré dans `src/start.ts`) attache `Authorization: Bearer <access_token>` à chaque RPC. C'est le blocage n°1 habituel d'une migration Capacitor (cookies cross-origin depuis `capacitor://`) — il est déjà levé.
- **Appels Supabase directs** (PostgREST / Storage / Realtime) : HTTPS vers le domaine Supabase, fonctionnent tels quels depuis la WebView.
- **PWA déjà en place** : `public/manifest.webmanifest`, `public/icons`, `public/sw.js`, `src/lib/pwa.ts`. Les icônes et l'écran `/offline` sont réutilisables.
- **TanStack Start expose les deux points d'extension nécessaires** : le mode SPA (`tanstackStart.spa.{enabled,prerender}`) et un fetch custom pour les server fns (`createStart({ serverFns: { fetch } })`, cf. `node_modules/@tanstack/start-client-core/dist/esm/createStart.d.ts`).

---

## 3. Chantiers, dans l'ordre

### Lot 0 — Cadrage (avant d'installer quoi que ce soit)

1. **Périmètre fonctionnel de la v1 mobile.** Le bundle mobile ne doit pas embarquer le site marketing (`index`, `pricing`, `features`, `faq`, `fr.*`, `en.*`, `build-clubero`, `demo`…). Route d'entrée = `/login` puis `/_authenticated`.
2. **Domaine d'API dédié** (ex. `https://app.clubero.<tld>`) + variable `VITE_API_ORIGIN`, et un `.env.mobile` distinct de `.env` / `.env.qa`.
3. **Identifiants** : bundle id iOS/Android (`com.clubero.app`), nom d'app, comptes développeurs.

### Lot 1 — Build SPA

- Activer le mode SPA dans `vite.config.ts` (`tanstackStart: { spa: { enabled: true, prerender: { enabled: true, … } } }`) pour produire un shell HTML statique, sans casser le build Worker actuel (deux modes de build, pilotés par une variable d'env).
- Les 25 routes qui font `loader:` / `beforeLoad` avec un server fn s'exécuteront désormais **côté client** : prévoir des états de chargement et vérifier qu'aucune ne suppose un contexte SSR.
- Vérifier qu'aucun module côté client n'importe transitivement un `*.server.ts` (`stripe.server.ts`, `push-send.server.ts`, `authz.server.ts`, `client.server.ts`…).

#### Audit lot 1 — exécuté le 30/07/2026 en simulateur (build SPA embarqué, backend `vite preview` sur bughunt)

Écrans parcourus sans aucune erreur (log serveur vierge) : Home (dashboard + checklist), Events (état vide + filtres), Teams (liste), Wall, Profile, Admin (Club settings), **Tournament payments** (`admin/payments.dashboard`, route à loader). Les mutations fonctionnent aussi : le club et l'équipe U9 ont été créés à travers l'app. Le pattern loader-côté-client est validé ; les 18 routes à loaders restantes sont majoritairement des pages publiques hors périmètre v1 ou suivent le même pattern (`players/$playerId/*`).

Découvertes à traiter (lot 5 sauf mention) :

1. **Session non persistée entre deux lancements** — ~~à investiguer~~ **RÉSOLU le 30/07/2026**. Fausse piste : la session était persistée depuis le début (le `localStorage` WKWebView survit au relaunch, à la réinstallation de l'app et au reboot du simulateur). Le vrai défaut était le routage d'entrée : `/` (marketing) et `/login` ne consultaient jamais la session. Corrigé par deux `beforeLoad` gardés par `isNativePlatform()` (no-op web) : `/` → `/home` si session, sinon `/login` ; `/login` → `/home` si session déjà valide (sauf lien d'invitation). Validé en simulateur sur deux cycles kill/relaunch : ouverture directe sur le dashboard. Aucun besoin de `@capacitor/preferences`.
2. **Prompt d'installation PWA** (« Installer Clubero ») affiché en natif — à masquer derrière `isNativePlatform()`.
3. **Instructions PWA dans Profile** (« Installez Clubero sur iPhone » : Safari → Partager → écran d'accueil) — absurdes en natif, même traitement. C'est l'emplacement où le CTA push natif (lot 3) prendra place.
4. **Section Subscription visible dans le build iOS** — confirmé à l'écran ; le masquage prévu au lot 4 (risque Apple 3.1.1) est bien nécessaire.
5. Localisation instable au premier lancement (home en anglais après réinstallation, français ensuite) — vérifier la détection de langue dans la WebView.

### Lot 2 — Server functions cross-origin

- Dans `src/start.ts`, ajouter `serverFns: { fetch }` : si `Capacitor.isNativePlatform()`, réécrire l'URL relative `/_serverFn/...` en `${API_ORIGIN}/_serverFn/...`.
- Côté Worker (`src/server.ts`) : CORS pour les origines `capacitor://localhost` et `http://localhost` — preflight `OPTIONS`, `Access-Control-Allow-Headers: authorization, content-type`, `Allow-Methods`. Même traitement pour `src/routes/api/*`.
- Auditer les server fns qui liraient implicitement `Origin`, `Referer` ou un cookie.
- Auditer les 63 usages de `window.location` : `window.location.origin` vaut `capacitor://localhost` en natif (notamment `src/routes/forgot-password.tsx:43`, `redirectTo` de reset password → doit pointer sur un lien universel, pas sur l'origine WebView).

### Lot 3 — Notifications push (chantier le plus lourd)

- Le Web Push actuel (VAPID + `public/sw.js` + `src/lib/push-subscribe.ts`) **ne fonctionne pas** dans une WebView : ni WKWebView (iOS réserve le Web Push à Safari / PWA écran d'accueil), ni WebView Android.
- Passer à `@capacitor/push-notifications` + Firebase (FCM pour Android, APNs via FCM ou direct pour iOS).
- **Impact base de données** : la table `push_subscriptions` est modelée pour le Web Push (`endpoint`, `p256dh`, `auth`). Ajouter une colonne `channel` (`web` | `fcm` | `apns`) et un champ token natif, avec migration + mise à jour RLS.
- **Impact serveur** : `src/lib/push-send.server.ts`, `push-fanout.server.ts`, `push-dispatch*.ts` doivent router par canal. Garder le Web Push pour le PWA desktop.
- Deep-link depuis la notification vers la route concernée.

#### Avancement lot 3 — 31/07/2026

Livré et validé en simulateur (hors dépendances Apple) :

- Migration additive `channel` (`web` | `fcm` | `apns`) appliquée sur bughunt. Le token natif est stocké dans `endpoint` — l'index UNIQUE existant fournit l'upsert, aucune colonne supplémentaire.
- `sendPushToUser` route par canal : `web` inchangé, `fcm`/`apns` tracés et ignorés tant que l'expéditeur natif n'existe pas (un token opaque ne doit jamais atteindre le chemin VAPID). Tous les chemins d'envoi passent par cette fonction — point de routage unique.
- `/api/push/subscribe` accepte le corps natif `{channel, token}` ; `unsubscribe` accepte les tokens opaques.
- `src/lib/native-push.ts` : permission → `register()` → token → POST. Carte « Cet appareil » du profil avec CTA natif. Ré-enregistrement silencieux au lancement + navigation depuis un tap de notification.
- Entitlement `aps-environment=development` via `ios/debug.xcconfig`.

**Piège découvert — import dynamique du plugin.** `await import("@capacitor/push-notifications")` laisse une promesse **pendante** en WKWebView : ni valeur ni rejet. Conséquence : `getNativePushStatus()` retournait `"unavailable"` et la carte ne s'affichait pas, sans la moindre erreur. Corrigé par un import statique (commit `3a156854`). À retenir pour tout futur plugin Capacitor : **import statique**, la garde `isNativePlatform()` suffit à protéger le web.

**Reste bloqué par l'adhésion Apple** : `register()` est bien appelé et la permission accordée (`didGrant: 1`), mais iOS ne délivre aucun token car l'app est signée en ad-hoc (`TeamIdentifier=not set`) — les entitlements `aps-environment` ne s'appliquent pas. Dès l'adhésion active : renseigner `DEVELOPMENT_TEAM`, générer la clé APNs `.p8`, créer le projet Firebase, puis brancher l'expéditeur FCM HTTP v1 dans `push-send.server.ts`.

### Lot 4 — Paiements et conformité stores

- **Cotisations club, stages, tournois** (`payment-*.functions.ts`, Stripe Connect) : biens et services du monde réel → Stripe autorisé hors achat in-app.
- **Abonnement SaaS du club** (`billing.functions.ts`) : zone grise, exposé au risque « in-app purchase obligatoire » (Apple 3.1.1). Recommandation v1 : ne pas exposer l'achat / l'upgrade d'abonnement dans le build iOS.
- **Stripe Checkout** : ouvrir via `@capacitor/browser` (SFSafariViewController / Custom Tabs), pas de `window.location.href`, et retour par universal link / app link.

### Lot 5 — Intégration native et UX

- Plugins : `@capacitor/app` (bouton retour Android → `router.history.back()`, deep links), `status-bar`, `splash-screen`, `keyboard`, `browser`, `network`, `preferences`, `share`, et `camera`/`filesystem` pour les uploads (`camp-cover-upload`, `club-logo`, `team-image`, `attachments`, `ticket-thread`).
- **Safe areas** : `viewport-fit=cover` + `env(safe-area-inset-*)` dans `src/styles.css` (encoche iOS, barre de gestes).
- **Désactiver le service worker en natif** : ajouter un garde `Capacitor.isNativePlatform()` dans `shouldRefuse()` de `src/lib/pwa.ts`, sinon le SW peut servir du HTML périmé dans la WebView.
- Écran hors-ligne natif (réutiliser `src/routes/offline.tsx`).

#### Avancement lot 5 — 31/07/2026

- **Safe areas : rien à faire.** `viewport-fit=cover`, `pt-[env(safe-area-inset-top)]` sur le header, `pb-…` sur la bottom-nav, FABs, sheets, bandeau cookies — l'héritage PWA couvrait déjà tout, vérifié à l'écran. Le poste estimé à 4–6 j était à zéro.
- **Coquille native** (`src/lib/native-shell.ts`, appelée au montage de la racine) : `SplashScreen.hide()` couplé à `launchAutoHide: false` (sans quoi le splash s'auto-masquait avant le montage de React et laissait un écran blanc), `StatusBar` en `Style.Default`, bouton retour matériel Android → `window.history.back()` / `exitApp()`.
- **Uploads photo : aucun plugin nécessaire.** Vérifié en simulateur — un simple `<input type="file">` ouvre la feuille native iOS (Photothèque / Prendre une photo / Choisir un fichier). Les 22 surfaces d'upload fonctionnent telles quelles ; `@capacitor/camera` et le refactor associé sont évités.
- **Descriptions d'usage Info.plist ajoutées** (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`). Elles étaient absentes : sur un appareil réel, « Prendre une photo » **tuait l'app** — invisible en simulateur, faute de caméra, et cause de rejet en review. À localiser via `InfoPlist.strings` au lot 6.
- **Bandeau hors ligne natif** (`use-online-status.ts` + `offline-banner.tsx`). Nécessaire car `/offline` n'est servi que par le service worker, désactivé en natif — l'app ne signalait aucune perte de réseau.

**Ce que le test réseau a appris (Wi-Fi du Mac coupé puis rétabli, deux passes) :**

1. Une première version reposait sur `navigator.onLine` seul, sans plugin. Le test a montré que **WKWebView émet `offline` mais jamais `online`** : le bandeau apparaissait et ne repartait plus. Un indicateur incapable de s'éteindre est pire que pas d'indicateur — d'où le passage à `@capacitor/network` en natif (`navigator.onLine` reste la source sur le web).
2. Même avec le plugin, le bandeau ne se retirait pas. Test décisif : le Club wall a **chargé des données fraîches** depuis bughunt pendant que le bandeau affichait « hors ligne ». Le réseau fonctionnait donc ; c'est la couche de connectivité d'iOS qui **reste bloquée dans le simulateur** après un retour du Wi-Fi de l'hôte. Confirmé par un relancement de l'app : processus neuf, aucun bandeau.
3. Filet de sécurité ajouté en conséquence : re-lecture de `Network.getStatus()` au retour au premier plan (`appStateChange`), car un changement survenu pendant la suspension n'émet pas toujours d'événement.

**Reste à valider sur appareil réel :** le retrait du bandeau au retour du réseau (mode avion off). Le simulateur ne permet pas de le prouver.

#### Plateforme Android — 31/07/2026

Compte Google Play en organisation, **identité vérifiée** — donc pas de test fermé imposé (14 jours / 12 testeurs) et aucune dépendance à Apple sur ce chemin.

État : `android/` généré avec les 7 plugins, projet Firebase `clubero-e5c42` (package `app.clubero.mobile`) câblé, **APK debug de 24 Mo construit avec succès**. Vérifié dans le binaire : Firebase/FCM présent, bundle web embarqué, origine `10.0.2.2` et cible bughunt.

Trois pièges rencontrés, tous consignés dans le code :

1. **Le JDK 25 livré par Android Studio est rejeté** par Gradle 8.14 / AGP 8.13 (« Unsupported class file major version 69 »). JDK 21 LTS installé et épinglé dans `android/gradle.properties` — le build ne dépend donc plus du shell. À noter : le wrapper Gradle a malgré tout besoin d'un `JAVA_HOME` pour **démarrer**, avant même de lire `gradle.properties`.
2. **Android bloque le trafic en clair depuis l'API 28.** Le serveur de dev étant en HTTP, toutes les requêtes auraient échoué. Autorisé via `android/app/src/debug/` uniquement, et restreint à `10.0.2.2` et `localhost` ; les builds de release n'héritent pas de ce manifeste.
3. **L'émulateur n'atteint pas `localhost`** : il faut `10.0.2.2`, d'où `.env.mobile-android` et le script `build:mobile:android` (mode Vite distinct pour ne pas mélanger les origines avec iOS).

Choix d'image système à conserver : variante **Google Play** obligatoire — sans les Play Services, FCM ne reçoit rien. ARM64 pour l'exécution native sur Apple Silicon.

`google-services.json` est commité volontairement : la clé est restreinte au nom de package, c'est la pratique recommandée par Google et c'est nécessaire à la CI du lot 7.

### Lot 6 — Publication

- Comptes : Apple Developer Program (99 $/an, délai de validation à anticiper), Google Play Console (25 $ une fois).
- Icônes et splash via `@capacitor/assets`.
- Fiches store, captures (les captures existent déjà dans les commits récents), politique de confidentialité (`docs/privacy/`), questionnaire App Privacy / Data Safety.
- **Données de mineurs** : l'app gère des joueurs mineurs et des contacts parents → déclaration store à traiter sérieusement (public visé, RGPD/COPPA).
- Comptes de démonstration pour les reviewers.
- Optionnel : mises à jour OTA du bundle JS (Capgo / Capacitor Live Updates).

### Lot 7 — CI/CD et tests

- `bun run build:mobile && npx cap sync` dans la CI ; build iOS sur runner macOS, signature via fastlane match ou App Store Connect API key.
- Les tests Playwright existants restent sur le build web ; ajouter une passe de smoke tests sur simulateur/émulateur.

---

## 4. Ordre recommandé

1. Lot 0 + spike technique : lots 1 et 2 sur une branche, jusqu'à un login + une page authentifiée qui fonctionne dans le simulateur iOS. **C'est le go/no-go.**
2. Lot 3 (push) — à démarrer tôt, il touche la base de données et le serveur.
3. Lots 5 puis 4.
4. Lots 6 et 7.

## 5. Risques principaux

| Risque                                                                      | Mitigation                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Publish Lovable déclenché sur un `main` contenant du code mobile non validé | Ne merger dans `main` que des commits publiables en l'état (§6) |
| Le mode SPA casse des routes qui supposent le SSR                           | Spike lot 1 avant tout engagement de planning                   |
| Push natif = refonte du modèle de données et du dispatch                    | Traiter en lot autonome, tôt                                    |
| Rejet Apple sur l'abonnement SaaS (IAP)                                     | Ne pas exposer l'achat d'abonnement sur iOS en v1               |
| Rejet Apple 4.2 si l'app reste un simple wrapper                            | Le choix de l'option B + push natif + caméra y répond           |
| Double build (Worker SSR + SPA) qui diverge                                 | Un seul `vite.config.ts` piloté par variable d'env, testé en CI |

---

## 6. Stratégie de non-régression prod

### 6.1 Modèle de déploiement

La prod est déployée **manuellement, via le bouton Publish de Lovable**. Aucun workflow GitHub ne déploie (`.github/workflows/` ne contient que les tests unitaires, RLS et E2E).

Conséquence : pousser sur `main` ne déploie rien — mais **Publish déploie l'état courant de `main`**, pas un commit choisi. Un publish déclenché pour un hotfix sans rapport embarquerait donc tout code mobile déjà mergé.

> **Règle** : ne merger dans `main` que des commits publiables en l'état. Tout le reste vit sur `feat/capacitor` jusqu'au go/no-go.

### 6.2 Surface de contact avec le code prod

Seuls **4 fichiers existants** seront modifiés par la migration ; tout le reste sera du code nouveau (fichiers neufs, `ios/`, `android/`), donc non-régressif par construction. Rien n'est implémenté à ce jour : la non-régression est une propriété **à garantir** au moment d'écrire le code (via le canary et les tests), pas un état constaté.

| Fichier          | Changement                 | Neutralisation côté web                                                                                                                           | Publiable seul ?                |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `vite.config.ts` | mode SPA                   | conditionné à `process.env.MOBILE_BUILD === "1"` ; `bun run build` ne l'active jamais                                                             | **Non** — garder sur la branche |
| `src/start.ts`   | `serverFns.fetch` custom   | early-return sur le `fetch` global hors natif ; détection via `globalThis.Capacitor?.isNativePlatform?.()` pour ne rien ajouter au bundle web     | Oui                             |
| `src/server.ts`  | CORS                       | en-têtes émis uniquement si `Origin` ∈ allowlist stricte (`capacitor://localhost`, `http://localhost`) ; jamais `*` ; aucune réponse web modifiée | Oui                             |
| `src/lib/pwa.ts` | garde service worker natif | garde ajoutée dans `shouldRefuse()` — ne peut que refuser **plus**, jamais moins                                                                  | Oui                             |

Canary : `bun run build` avant/après la branche doit produire un manifeste identique.

Garde-fou CI complémentaire : une assertion qui **échoue si `MOBILE_BUILD` fuite dans un build web** (variable absente ou vide sur le chemin de build par défaut), pour que le mode SPA ne puisse jamais s'activer sur la prod par accident de configuration.

`main` est écrit en continu par `gpt-engineer-app[bot]` (Lovable) — les 40 derniers commits, sans exception. `feat/capacitor` divergera donc vite : rebase fréquent, et validation de chaque commit no-op **avant** son merge (sur bughunt), jamais après.

### 6.3 Isolation de l'infrastructure

- **Supabase** : projet QA `bughunt` (`dkcfcifsrnnaqaipfuzi`) distinct de la prod (`woawmhuntajpiezmmgzm`). `bun run dev:qa` refuse de démarrer sur la prod. `supabase/config.toml` pointe sur le projet QA — un `supabase db push` ne peut donc pas atteindre la prod par accident. **Ne pas modifier ce fichier.**

#### bughunt est partagé avec les suites de tests

bughunt héberge déjà les **29 suites RLS** (`tests/rls/*.rls.ts`) et les fixtures E2E persistantes — 4 comptes `e2e-*@clubero.app` et le club « E2E Test Club ». Le développement mobile doit cohabiter sans les perturber.

Seule la suite **E2E** tourne automatiquement (cron 4 h UTC). La suite **RLS n'a aucun déclencheur planifié** : `rls-tests.yml` ne définit que `workflow_dispatch`. Un rouge nocturne ne peut donc venir que de l'E2E — et aucune régression RLS n'est détectée automatiquement (voir l'anomalie signalée plus bas).

Constat rassurant : **aucune suite RLS ne couvre `push_subscriptions`** — la migration additive du lot 3 ne casse donc aucun test existant.

Le risque réel porte sur les **fixtures**, pas sur le schéma :

1. **Compte et club dédiés** — créer `mobile-dev@clubero.app` + un « Mobile Dev Club » sur bughunt. Ne jamais se connecter avec les 4 comptes E2E ni écrire dans « E2E Test Club » : une suite E2E rouge le lendemain matin ressemblerait à une régression alors que ce serait de la pollution de données.
2. **Zéro migration pendant le spike** — les lots 1 et 2 ne font que du build et du transport HTTP ; ils lisent la base sans la modifier.
3. **Migration push (lot 3)** — appliquée sur bughunt seulement quand le code correspondant est prêt, puis `bun run test:rls` et un run E2E manuel (`workflow_dispatch`) au vert **avant** de toucher à la prod. Le RLS ne tournant jamais tout seul, ce lancement manuel est impératif : rien ne le rattrapera.

> **Anomalie repérée en passant, sans lien avec le mobile** : `rls-tests.yml` contient du code mort pour un cron inexistant — le message « 🌙 Lancement automatique (cron nocturne) » (l.42) et surtout l'étape « Notify on failure (cron only) » conditionnée à `github.event_name == 'schedule'` (l.55), qui ne peut jamais être vraie faute de déclencheur `schedule:`. Résultat : les régressions RLS ne sont ni détectées ni notifiées automatiquement. Le commentaire « after RLS tests at 3 AM » dans `e2e-tests.yml:3` est périmé pour la même raison.

#### Décision : le développement mobile reste sur bughunt

Un projet Supabase dédié a été envisagé puis écarté : coût d'amorçage (309 migrations à rejouer, comptes auth à recréer faute de `seed.sql`, `pg_cron` à neutraliser) et dérive à entretenir à chaque nouvelle migration, pour un bénéfice marginal — les garde-fous ci-dessus couvrent le risque réel.

Alternative également écartée : stack Supabase locale (gratuite et totalement isolée, mais `AGENTS.md` note qu'il n'en existe pas aujourd'hui ; rejeu des 309 migrations et reseed auth à valider).

#### À vérifier sur bughunt — cron jobs pointant vers la production

Indépendamment du mobile : plusieurs migrations créent des jobs `pg_cron` qui font des `net.http_post` vers `https://www.clubero.app/api/public/hooks/*` (cf. `supabase/migrations/20260620175926_*.sql:27`) — `clubero-payment-reminders`, `clubero-trial-reminders`, `social-sync-hourly`, `coach-insights-daily`, `process-email-queue`.

Le même schéma ayant été appliqué à bughunt, ces jobs y sont probablement planifiés. Sans secrets dans le Vault les appels sont rejetés (401, simple bruit) ; **avec** des secrets de production valides, un environnement de test déclencherait de vraies actions de prod — relances de paiement par email à de vrais utilisateurs, purge de rétention de données.

Contrôle :

```sql
select jobname, schedule, command from cron.job;
```

Si des jobs y sont actifs : `select cron.unschedule(jobid) from cron.job;`

- **À vérifier** : le pipeline Lovable applique-t-il lui-même les migrations de `supabase/migrations/` au projet Supabase connecté (la prod) lors d'un publish ? Si oui, une migration mergée dans `main` atteint la prod au prochain publish — même règle qu'en §6.1.
- **Firebase / APNs** : projet dédié, aucune interaction avec l'existant.
- **Stripe** : clés test pendant tout le développement mobile.
- **Env** : `.env.mobile` gitignoré, origine d'API distincte de la prod pendant le spike.

### 6.4 Migration `push_subscriptions` — le seul changement de schéma prod

- **Additive uniquement** : `ADD COLUMN channel text NOT NULL DEFAULT 'web'` + `native_token text NULL`. Aucun renommage ; `endpoint` / `p256dh` / `auth` gardent leurs contraintes actuelles tant que le canal natif n'est pas livré.
- **Déployer la migration en prod avant l'app mobile** : le code web actuel continue de fonctionner sans en avoir connaissance.
- Le routage par canal dans `push-send.server.ts` garde `web` comme branche par défaut → comportement inchangé pour les abonnés existants.
- Validation d'abord sur bughunt.

### 6.5 Gate avant merge

```bash
bun run test && bun run typecheck && bun run check:guards && bun run check:i18n && bun run build
```

Plus la suite E2E Playwright sur bughunt. Le `bun run build` en mode web doit rester vert et inchangé.

### 6.6 Ordre de merge

1. Commits no-op web (CORS, garde SW, fetch custom neutralisé) → `main`, vérifiables isolément, publiables sans risque.
2. Migration `push_subscriptions` additive → prod, seule.
3. Routage push par canal → `main`.
4. Mode SPA + config Capacitor → seulement après validation du spike.

---

## 7. Planning

Hypothèses : un développeur assisté, comptes développeur Apple et Google **en organisation** (demandes déposées, D-U-N-S obtenu, vérification en cours au 29/07/2026).

### Effort de développement

| Lot                       | Effort          | Commentaire                                                                     |
| ------------------------- | --------------- | ------------------------------------------------------------------------------- |
| 0 — Cadrage               | 1–2 j           | Périmètre v1, domaine d'API, bundle IDs                                         |
| 1 — Build SPA             | 3–5 j           | **Poste le plus incertain** : 25 routes à loaders serveur basculent côté client |
| 2 — Cross-origin + CORS   | 2–3 j           | Bien balisé, l'auth bearer est déjà en place                                    |
| **Go/no-go**              | **~2 semaines** | Login fonctionnel dans le simulateur iOS                                        |
| 3 — Push natif            | 5–8 j           | FCM + APNs, migration DB, routage dispatch, deep links                          |
| 5 — Intégration native    | 4–6 j           | Safe areas sur 93 composants, plugins, bouton retour, caméra                    |
| 4 — Paiements             | 2–3 j           | Stripe via in-app browser, retour par universal link                            |
| 6 — Assets & fiches store | 2–3 j           | Icônes, captures, App Privacy, politique de confidentialité                     |
| 7 — CI/CD                 | 2–3 j           | Reportable après la v1                                                          |
| QA sur devices réels      | 5–8 j           | Poste systématiquement sous-estimé                                              |

**Total : 6 à 8 semaines de travail effectif.**

### Dépendances externes

- **Apple** : la vérification (1–3 semaines) recouvre le spike lots 1+2 — aucun temps mort. Dès l'adhésion active : créer le bundle ID, l'app dans App Store Connect et **générer la clé APNs (.p8)**, prérequis du lot 3 (Firebase iOS). Le push distant réel ne se teste pas sur simulateur : device physique + compte payant obligatoires.
- **Google Play** : compte organisation → **exempté** des 14 jours de test fermé à 12 testeurs imposés aux comptes personnels. Aucun délai ajouté en fin de parcours.
- **Review App Store** : 24–48 h en régime normal ; budgéter deux cycles de rejet sur une première soumission.

### Dates cibles (base 29/07/2026)

| Rythme                      | Mise en production              |
| --------------------------- | ------------------------------- |
| Soutenu                     | fin septembre – mi-octobre 2026 |
| Partagé avec le produit web | fin novembre 2026               |

En cas de glissement vers mi-décembre : Apple gèle reviews et mises en production environ une semaine autour de Noël — dix jours de retard peuvent en coûter trois semaines.

### Principal risque de dérive

Le lot 1. Si le mode SPA révèle des routes structurellement dépendantes du SSR, l'estimation ne tient plus et il s'agit d'un refactor de routage. D'où le spike en premier : deux semaines pour valider le plan avant tout engagement.
