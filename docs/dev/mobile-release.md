# Publication mobile automatisée (iOS + Android)

`.github/workflows/mobile-release.yml` construit, signe et envoie les deux
applications sans intervention manuelle. Après la configuration initiale
décrite ici, publier une version se résume à :

1. pousser un tag `v1.2.3` (ou lancer le workflow à la main) ;
2. **approuver l'exécution** sur l'environnement GitHub `mobile-release` ;
3. attendre — l'AAB arrive sur la piste interne du Play Store, l'IPA sur
   TestFlight.

Rien d'autre n'est à faire : pas de bump de version, pas d'ouverture de Xcode,
pas de `bun run build:mobile` local, pas d'upload manuel.

## Ce que le workflow fait

| Étape                     | Android                                  | iOS                                            |
| ------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Shell SPA                 | `bun run build:mobile:prod`              | idem                                           |
| Synchronisation Capacitor | `cap sync android`                       | `cap sync ios`                                 |
| Numéro de build           | `versionCode` via `ANDROID_VERSION_CODE` | `CURRENT_PROJECT_VERSION` via `xcodebuild`     |
| Signature                 | keystore restauré depuis un secret       | certificat `.p12` + profil créé par la clé API |
| Artefacts                 | `.aab` + `.apk`                          | `.ipa` + dSYM                                  |
| Envoi                     | piste **interne** du Play Store          | **TestFlight**                                 |

Les artefacts sont attachés à l'exécution GitHub pendant 30 jours, même quand
l'envoi aux stores est désactivé (`upload: false` en lancement manuel).

### Numérotation des builds

Le numéro de build vaut `MOBILE_BUILD_NUMBER_OFFSET + numéro d'exécution`,
soit `1001`, `1002`… par défaut. Il est donc strictement croissant et toujours
supérieur aux derniers builds envoyés à la main (`versionCode 13` côté Android,
`CFBundleVersion 6` côté iOS). C'est ce qui supprime le geste manuel le plus
facile à oublier : un numéro de build n'est **jamais** réutilisable, ni chez
Google ni chez Apple, même après suppression du build correspondant.

La version affichée (`versionName` / `MARKETING_VERSION`) vient du tag :
`v1.2.0` donne `1.2.0`. En lancement manuel sans valeur, les versions du projet
sont conservées.

## Configuration initiale — à faire une seule fois

### 1. Environnement GitHub et validation

Repository → **Settings → Environments → New environment** → `mobile-release`.
Activer **Required reviewers** et s'y ajouter. C'est cette protection qui crée
le point de validation unique : les deux jobs attendent une seule approbation
au démarrage de l'exécution.

Tous les secrets ci-dessous se déposent dans cet environnement (ou, au choix,
dans les secrets du dépôt).

> Sans environnement protégé, le workflow s'exécute sans demander d'approbation.

### 2. Android

**Keystore.** Le keystore de release existe déjà (`~/clubero-release.keystore`,
hors du dépôt). L'encoder :

```bash
base64 -i ~/clubero-release.keystore | pbcopy
```

Secrets à créer :

| Secret                      | Valeur                                           |
| --------------------------- | ------------------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | sortie de la commande ci-dessus                  |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` de `android/keystore.properties` |
| `ANDROID_KEY_ALIAS`         | `clubero`                                        |
| `ANDROID_KEY_PASSWORD`      | `keyPassword`                                    |

> Les mots de passe sont réinjectés dans un fichier `.properties` Java :
> éviter les antislashs, qui y sont des caractères d'échappement.

**Compte de service Play.** Google Play Console → **Configuration → Accès à
l'API** → associer un projet Google Cloud → créer un compte de service, lui
accorder l'autorisation _Gérer les versions_ sur l'application
`app.clubero.mobile`, puis télécharger sa clé JSON. Coller le JSON **entier**
dans le secret `PLAY_SERVICE_ACCOUNT_JSON`.

> **Premier envoi obligatoirement manuel.** Google refuse tout upload par API
> tant qu'aucun bundle n'a été déposé via la Console pour ce package. Lancer
> une fois le workflow avec `upload: false`, récupérer l'AAB dans les artefacts,
> le déposer à la main sur la piste interne. Les envois suivants passent par
> l'API.

### 3. iOS

**Certificat de distribution.** Depuis le Mac où il est installé : Trousseau
d'accès → certificat _Apple Distribution: …_ → clic droit → **Exporter** →
format `.p12`, avec un mot de passe. Puis :

```bash
base64 -i dist.p12 | pbcopy
```

Le certificat est importé plutôt que créé par la CI parce qu'Apple limite le
compte à trois certificats de distribution : les laisser créer à chaque
exécution épuiserait le quota en trois builds.

**Clé API App Store Connect.** App Store Connect → **Utilisateurs et accès →
Intégrations → App Store Connect API** → générer une clé de rôle _App Manager_.
Noter le _Key ID_ et l'_Issuer ID_, télécharger le `.p8` (**téléchargeable une
seule fois**), puis `base64 -i AuthKey_XXXX.p8 | pbcopy`.

| Secret                     | Valeur                                     |
| -------------------------- | ------------------------------------------ |
| `IOS_DIST_CERT_P12_BASE64` | certificat `.p12` encodé                   |
| `IOS_DIST_CERT_PASSWORD`   | mot de passe choisi à l'export             |
| `ASC_KEY_ID`               | Key ID de la clé API                       |
| `ASC_ISSUER_ID`            | Issuer ID (identique pour toutes les clés) |
| `ASC_KEY_P8_BASE64`        | fichier `.p8` encodé                       |

L'app doit exister dans App Store Connect sous le bundle ID
`app.clubero.mobile` avant le premier envoi. Le profil de provisioning, lui,
est créé et renouvelé automatiquement par Xcode via la clé API
(`-allowProvisioningUpdates`) : rien à entretenir à l'expiration.

### 4. Variables optionnelles

Repository → Settings → **Variables** (pas des secrets, ce sont des valeurs
publiques embarquées dans le bundle) :

| Variable                                 | Défaut                 | Rôle                                        |
| ---------------------------------------- | ---------------------- | ------------------------------------------- |
| `MOBILE_API_ORIGIN`                      | `https://clubero.app`  | backend distant appelé par la WebView       |
| `MOBILE_PUBLIC_ORIGIN`                   | = origine d'API        | domaine des liens publics (QR, invitations) |
| `MOBILE_BUILD_NUMBER_OFFSET`             | `1000`                 | base du numéro de build                     |
| `VITE_SUPABASE_URL`                      | repli du `vite.config` | projet Supabase visé                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY`          | repli du `vite.config` | clé anon                                    |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | —                      | analytics                                   |
| `VITE_SENTRY_DSN`                        | —                      | rapports d'erreur                           |

## Ce qui reste manuel — et pourquoi

L'automatisation s'arrête aux pistes de test, volontairement :

- **Promotion en production** (piste interne → production Play, TestFlight →
  App Store) : c'est une décision commerciale, et côté Apple elle déclenche une
  revue humaine de plusieurs jours. Le workflow s'arrête juste avant.
- **Fiches store, captures, questionnaires App Privacy / Data Safety** : édités
  dans les consoles, hors du dépôt.
- **Renouvellement du certificat de distribution** (tous les ans) : ré-exporter
  le `.p12` et mettre à jour le secret.

## Dépannage

**« Secrets manquants : … »** — le job s'arrête avant tout build : le secret
nommé est absent de l'environnement `mobile-release` et des secrets du dépôt.

**Gradle : `Unsupported class file major version`** — le JDK est mal résolu. Le
workflow réécrit `org.gradle.java.home` dans `~/.gradle/gradle.properties`, qui
est prioritaire sur `android/gradle.properties` (lequel pointe volontairement
sur le JDK 21 de Homebrew, pour les postes macOS).

**`Scheme App not found`** — le schéma partagé
`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` doit rester
commité. Xcode en génère un dans `xcuserdata/`, gitignoré, invisible en CI.

**Play Store : `APK specifies a version code that has already been used`** —
une exécution a rejoué un numéro déjà consommé (compteur d'exécutions
réinitialisé). Augmenter `MOBILE_BUILD_NUMBER_OFFSET`.

**TestFlight : le build n'apparaît pas** — l'envoi réussit avant le traitement
Apple, qui prend 5 à 30 minutes. Un rejet arrive par e-mail (souvent une clé
`Info.plist` d'usage manquante).
