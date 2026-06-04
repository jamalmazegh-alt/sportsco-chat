# Spec — Templates d'import Super-Admin (v2)

Statut : à valider — auteur : Lovable, 2026-06-04

## 1. Contexte

L'écran `/superadmin/onboarding/import` permet à un super-admin de pré-charger un club avec des **joueurs**, **entraîneurs** ou un **planning** depuis un fichier Excel/CSV. Le bouton "Télécharger le modèle" génère aujourd'hui un fichier minimaliste : **une seule ligne d'en-têtes techniques** (`equipe`, `prenom_joueur*`, `date_naissance*`…). Conséquences observées :

- Les clubs ne savent pas quoi mettre dans `categorie`, ni quels formats sont attendus (date ISO ? FR ?).
- Pas d'exemple → ils inventent des valeurs (`Garcon`, `M`, `H`) qui cassent la validation `inSet(["Masculin","Féminin","Mixte"])`.
- Tout est en français, alors que l'app supporte FR/EN/ES/DE/IT/NL/PT.
- Les colonnes à valeurs contraintes (Genre, Rôle, Lien parent, Domicile/Extérieur, Type d'événement, jours de récurrence) n'exposent pas leurs options.

## 2. Objectifs

1. **Lisibilité** : un club non technique doit remplir le template sans documentation externe.
2. **Multi-langue** : générer chaque template dans la langue choisie par le super-admin, libellés et exemples traduits.
3. **Compatibilité ascendante** : les fichiers actuels (en-têtes `key` techniques en FR) doivent continuer à être reconnus par `templateMatchRatio`.

## 3. Périmètre

In scope : génération des fichiers `.xlsx` (joueurs, entraîneurs, planning), parsing des templates v2 à l'import, sélecteur de langue dans l'UI.

Hors scope :
- Refonte du wizard d'import (étapes, IA fallback).
- Templates CSV multi-langues (CSV reste FR, sans onglet d'instructions).
- Édition in-app du template (toujours téléchargé puis ré-uploadé).

## 4. Choix retenus (réponses utilisateur)

| Question | Choix |
|---|---|
| Lisibilité | Ligne d'exemple pré-remplie + onglet "Instructions" |
| Langues | FR + EN + ES + DE + IT + NL + PT |
| Spec | Oui, spec d'abord |

Pas de listes déroulantes Excel (data validation) ni de double ligne d'en-têtes — repoussé à une v3 si besoin.

## 5. Format du template v2

Chaque fichier `.xlsx` contient **2 onglets** :

### Onglet 1 — `Données` (nom traduit : `Data`, `Datos`, `Daten`, `Dati`, `Gegevens`, `Dados`)

| Ligne | Contenu |
|---|---|
| 1 | En-têtes humanisés traduits, avec `*` suffixé pour les champs obligatoires (ex. `Date de naissance *`) |
| 2 | **Exemple fictif pré-rempli** (1 ligne réaliste : `Dupont` / `Jean` / `2010-05-12` / `U13` / `Masculin` …) en gris italique |
| 3+ | Vide, prêt à être rempli |

Parsing : on continue d'utiliser `templateMatchRatio` sur la ligne 1 normalisée (toLowerCase + suppression accents/espaces/`*`). On ajoute aussi une **table de correspondance label-traduit → clé technique** pour mapper les en-têtes humanisés vers `key`. La ligne 2 (exemple) est détectée et **ignorée** au parsing (heuristique : exactement les valeurs de l'exemple par défaut OU marqueur `__example__` dans la première cellule masquée).

### Onglet 2 — `Instructions` (nom traduit)

Une mini-doc Markdown rendue en cellules Excel :

1. **À quoi sert ce fichier** (1 paragraphe)
2. **Tableau des champs** : `Colonne | Obligatoire | Format attendu | Exemple | Valeurs autorisées`
3. **Conseils** : encodage UTF-8, formats de date `YYYY-MM-DD`, heure `HH:MM`, supprimer la ligne d'exemple avant d'envoyer, taille max 5 Mo, 500 lignes max (50 pour planning).

## 6. Internationalisation

### 6.1 Source de traduction

Nouveau fichier `src/lib/superadmin-import/i18n-templates.ts` exportant :

```ts
type TemplateLocale = "fr" | "en" | "es" | "de" | "it" | "nl" | "pt";

type TemplateStrings = {
  sheets: { data: string; instructions: string };
  intro: { players: string; coaches: string; planning: string };
  conseils: string[];
  table: { col: string; required: string; format: string; example: string; allowed: string; yes: string; no: string };
  fieldLabels: Record<string /* key */, string>;
  fieldExamples: Record<string, string>;
  fieldFormats: Record<string, string>;
  enumValues: Record<string /* set name */, string[]>; // ex. genre: ["Masculin","Féminin","Mixte"] traduit
};

export const TEMPLATE_I18N: Record<TemplateLocale, TemplateStrings>;
```

Les valeurs `inSet([...])` côté `schemas.ts` restent les **clés canoniques FR** stockées en base ; les traductions sont uniquement pour l'affichage des cellules. Au parsing, on fait un `reverseEnum(locale, value)` pour retrouver la clé canonique.

### 6.2 Sélecteur de langue

Dans `onboarding.import.tsx`, au-dessus des 3 boutons "Télécharger le modèle", ajouter un `<Select>` shadcn avec les 7 langues. Valeur par défaut = langue du super-admin (`i18n.language`), fallback `fr`. La langue choisie est passée à `downloadTemplate(type, locale)`.

## 7. Détails d'implémentation

### 7.1 Génération (`onboarding.import.tsx`)

```ts
function downloadTemplate(type: ImportType, locale: TemplateLocale) {
  const t = TEMPLATE_I18N[locale];
  const fields = getFields(type);

  // Sheet 1 : Données
  const headers = fields.map(f => t.fieldLabels[f.key] + (f.required ? " *" : ""));
  const example = fields.map(f => t.fieldExamples[f.key] ?? "");
  const ws1 = XLSX.utils.aoa_to_sheet([headers, example]);
  // largeur colonnes auto (max 30)
  ws1["!cols"] = headers.map(h => ({ wch: Math.min(30, Math.max(12, h.length + 2)) }));
  // style ligne 2 : gris italique (SheetJS community edition ne supporte pas le style → on accepte le compromis et on l'indique dans l'onglet Instructions)

  // Sheet 2 : Instructions
  const rows: (string|number)[][] = [
    [t.intro[type]], [""],
    [t.table.col, t.table.required, t.table.format, t.table.example, t.table.allowed],
    ...fields.map(f => [
      t.fieldLabels[f.key],
      f.required ? t.table.yes : t.table.no,
      t.fieldFormats[f.key] ?? "",
      t.fieldExamples[f.key] ?? "",
      enumOptionsFor(f.key, t) ?? "",
    ]),
    [""], ...t.conseils.map(c => [c]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(rows);
  ws2["!cols"] = [{wch:30},{wch:14},{wch:24},{wch:24},{wch:40}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, t.sheets.data);
  XLSX.utils.book_append_sheet(wb, ws2, t.sheets.instructions);
  XLSX.writeFile(wb, `clubero-template-${type}-${locale}.xlsx`);
}
```

### 7.2 Parsing (compatibilité ascendante)

Dans `template-parse.ts` ajouter une étape de normalisation des en-têtes :

```ts
const HEADER_ALIASES: Record<ImportType, Record<string /* normalized header */, string /* key */>>;
// construit au module-load en parcourant TEMPLATE_I18N[*].fieldLabels
```

`tplParse(headers, rows, type)` :
1. Normalise chaque en-tête (lowercase, retire accents/espaces/`*`).
2. Si match dans `HEADER_ALIASES[type]` → on remappe vers la `key` canonique.
3. Sinon, fallback existant (la `key` est déjà la valeur d'en-tête).
4. **Ignore la ligne d'exemple** si elle correspond exactement à `t.fieldExamples` pour n'importe quelle locale (ou si vide après trim).
5. Pour les colonnes enum, on `reverseEnum` la valeur de la cellule vers la clé canonique avant validation.

`templateMatchRatio` continue de fonctionner car les en-têtes humanisés contiennent les `key` après normalisation (faux — ex. "Date de naissance" ne contient pas `date_naissance`). **Correctif** : on remplace `normHeaders.includes(norm(f.key))` par `normHeaders.some(h => HEADER_ALIASES[type][h] === f.key || h === norm(f.key))`.

### 7.3 Stockage des choix utilisateur

La langue choisie au download est mémorisée dans `localStorage` clé `clubero:import-template-locale` pour pré-sélectionner au prochain téléchargement.

## 8. Tests / validation manuelle

1. Télécharger les 3 templates dans les 7 langues → ouvrir dans Excel, vérifier ligne 1 lisible + ligne 2 exemple + onglet Instructions.
2. Remplir le template FR avec 3 vraies lignes, l'uploader → import OK sans IA fallback.
3. Remplir le template EN avec `Male`/`Female` (au lieu de `Masculin`/`Féminin`) → import OK (reverseEnum).
4. Uploader un ancien template (en-têtes `key` techniques) → import OK (compatibilité).
5. Garder la ligne d'exemple par erreur → import doit l'ignorer (toast info "ligne d'exemple ignorée").

## 9. Risques / limites

- **Pas de data validation Excel** (listes déroulantes) : SheetJS community edition ne les écrit pas proprement. Reporté en v3 — alternative : passer à `exceljs`.
- **Pas de style cellule** (gris italique sur ligne 2) : même raison. Mitigé par une note explicite dans l'onglet Instructions.
- **Volume de traduction** : ~30 champs × 7 langues = ~210 libellés à traduire. Première passe via Lovable AI, relecture utilisateur.

## 10. Estimation

- i18n-templates.ts (squelette + FR/EN complets, 5 autres langues traduites par IA) : ~400 lignes
- Refactor `downloadTemplate` + sélecteur de langue : ~80 lignes
- Refactor `template-parse.ts` (aliases + reverseEnum + skip example) : ~60 lignes
- Tests manuels : 30 min

Total : ~1 itération.
