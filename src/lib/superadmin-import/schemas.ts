/**
 * Schémas et constantes partagés client/serveur pour l'import super-admin.
 * Aucun import Node — utilisable côté browser.
 */

export type ImportType = "players" | "coaches" | "planning";

/** Définition d'un champ Clubero attendu dans un import. */
export type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  /** Validation locale appliquée après IA ou parsing template. */
  validate?: (value: string | null) => string | null;
};

const isEmail = (v: string | null): string | null => {
  if (!v) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Email invalide";
};
import { isStrictIsoDate, parseFlexibleDate } from "./sheet-date";

const isIsoDate = (v: string | null): string | null => {
  if (!v) return null;
  if (isStrictIsoDate(v)) return null;
  const { ambiguous } = parseFlexibleDate(v);
  if (ambiguous) return "Date ambiguë — fournir AAAA-MM-JJ";
  return "Date invalide — attendue AAAA-MM-JJ";
};
const isHHMM = (v: string | null): string | null => {
  if (!v) return null;
  return /^\d{2}:\d{2}$/.test(v) ? null : "Heure attendue HH:MM";
};
const inSet =
  (set: string[]) =>
  (v: string | null): string | null => {
    if (!v) return null;
    return set.includes(v) ? null : `Valeur attendue : ${set.join(", ")}`;
  };

export const PLAYER_FIELDS: FieldDef[] = [
  { key: "equipe", label: "Équipe", required: true },
  { key: "sport", label: "Sport", required: true },
  { key: "categorie", label: "Catégorie", required: true },
  {
    key: "genre",
    label: "Genre",
    required: false,
    validate: inSet(["Masculin", "Féminin", "Mixte"]),
  },
  { key: "saison", label: "Saison", required: false },
  { key: "prenom_joueur", label: "Prénom joueur", required: true },
  { key: "nom_joueur", label: "Nom joueur", required: true },
  { key: "date_naissance", label: "Date de naissance", required: true, validate: isIsoDate },
  { key: "numero_maillot", label: "N° maillot", required: false },
  { key: "numero_licence", label: "N° licence", required: false },
  { key: "poste", label: "Poste préféré", required: false },
  { key: "telephone_joueur", label: "Téléphone joueur", required: false },
  { key: "email_contact", label: "Email contact", required: false, validate: isEmail },
  { key: "prenom_parent_1", label: "Prénom parent 1", required: false },
  { key: "nom_parent_1", label: "Nom parent 1", required: false },
  { key: "email_parent_1", label: "Email parent 1", required: false, validate: isEmail },
  { key: "telephone_parent_1", label: "Téléphone parent 1", required: false },
  {
    key: "lien_parent_1",
    label: "Lien parent 1",
    required: false,
    validate: inSet(["Père", "Mère", "Tuteur"]),
  },
  { key: "prenom_parent_2", label: "Prénom parent 2", required: false },
  { key: "nom_parent_2", label: "Nom parent 2", required: false },
  { key: "email_parent_2", label: "Email parent 2", required: false, validate: isEmail },
  { key: "telephone_parent_2", label: "Téléphone parent 2", required: false },
  {
    key: "lien_parent_2",
    label: "Lien parent 2",
    required: false,
    validate: inSet(["Père", "Mère", "Tuteur"]),
  },
];

export const COACH_FIELDS: FieldDef[] = [
  { key: "equipe", label: "Équipe", required: true },
  { key: "sport", label: "Sport", required: true },
  { key: "categorie", label: "Catégorie", required: true },
  {
    key: "genre",
    label: "Genre",
    required: false,
    validate: inSet(["Masculin", "Féminin", "Mixte"]),
  },
  { key: "saison", label: "Saison", required: false },
  { key: "prenom", label: "Prénom", required: true },
  { key: "nom", label: "Nom", required: true },
  { key: "email", label: "Email", required: true, validate: isEmail },
  { key: "telephone", label: "Téléphone", required: false },
  { key: "numero_licence", label: "N° licence", required: false },
  {
    key: "role",
    label: "Rôle",
    required: true,
    validate: inSet(["coach", "assistant_coach", "manager"]),
  },
];

const PLANNING_TYPES = ["Entraînement", "Match", "Tournoi", "Réunion"];
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const validateRecurrence = (v: string | null): string | null => {
  if (!v) return null;
  const parts = v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = parts.filter((p) => !WEEKDAYS.includes(p));
  return bad.length ? `Jours invalides : ${bad.join(", ")}` : null;
};

export const PLANNING_FIELDS: FieldDef[] = [
  { key: "equipe", label: "Équipe", required: true },
  { key: "type", label: "Type", required: true, validate: inSet(PLANNING_TYPES) },
  { key: "titre", label: "Titre", required: false },
  { key: "date_debut", label: "Date début", required: true, validate: isIsoDate },
  { key: "heure_debut", label: "Heure début", required: true, validate: isHHMM },
  { key: "heure_fin", label: "Heure fin", required: false, validate: isHHMM },
  { key: "lieu", label: "Lieu", required: false },
  { key: "adversaire", label: "Adversaire", required: false },
  {
    key: "domicile",
    label: "Domicile/Extérieur",
    required: false,
    validate: inSet(["Domicile", "Extérieur"]),
  },
  {
    key: "recurrence_jours",
    label: "Jours récurrence",
    required: false,
    validate: validateRecurrence,
  },
  { key: "recurrence_fin", label: "Fin récurrence", required: false, validate: isIsoDate },
];

export function getFields(type: ImportType): FieldDef[] {
  if (type === "players") return PLAYER_FIELDS;
  if (type === "coaches") return COACH_FIELDS;
  return PLANNING_FIELDS;
}

/**
 * Normalisation d'en-tête tolérante partagée par le parsing template et le
 * pré-mapping IA. Enlève accents/casse/ponctuation, retire les mots-outils
 * FR/EN et unifie les synonymes fréquents (`N°`, `num`, `#` → `numero`,
 * `tel`/`phone` → `telephone`, `mail` → `email`, `jersey` → `maillot`,
 * `license` → `licence`, `pere`/`mere` → `parent`, …). Le résultat est une
 * chaîne compacte comparable directement à la clé Clubero.
 */
const STOPWORDS = new Set([
  "de",
  "du",
  "des",
  "d",
  "la",
  "le",
  "les",
  "l",
  "a",
  "au",
  "aux",
  "et",
  "the",
  "of",
  "for",
]);
const TOKEN_SYNONYMS: Record<string, string> = {
  n: "numero",
  no: "numero",
  num: "numero",
  nb: "numero",
  nbr: "numero",
  nro: "numero",
  number: "numero",
  numer: "numero",
  tel: "telephone",
  telephon: "telephone",
  phone: "telephone",
  mobile: "telephone",
  gsm: "telephone",
  portable: "telephone",
  mail: "email",
  courriel: "email",
  jersey: "maillot",
  shirt: "maillot",
  dossard: "maillot",
  license: "licence",
  licens: "licence",
  firstname: "prenom",
  lastname: "nom",
  surname: "nom",
  familyname: "nom",
  famille: "nom",
  team: "equipe",
  category: "categorie",
  cat: "categorie",
  season: "saison",
  birthdate: "datenaissance",
  birthday: "datenaissance",
  dob: "datenaissance",
  pere: "parent",
  papa: "parent",
  mere: "parent",
  maman: "parent",
  father: "parent",
  mother: "parent",
  tuteur: "parent",
  guardian: "parent",
};

export function normalizeHeader(s: string): string {
  const base = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/#/g, " numero ")
    .replace(/°/g, " ")
    .replace(/\*+/g, " ");
  const tokens = base
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => TOKEN_SYNONYMS[t] ?? t)
    .sort();
  return tokens.join("");
}

/** Compteur de colonnes obligatoires présentes — sert au seuil 80% de détection template. */
export function templateMatchRatio(headers: string[], type: ImportType): number {
  const fields = getFields(type);
  const required = fields.filter((f) => f.required);
  const normHeaders = headers.map(normalizeHeader);
  const matched = required.filter(
    (f) =>
      normHeaders.includes(normalizeHeader(f.key)) ||
      normHeaders.includes(normalizeHeader(f.label)),
  );
  return required.length === 0 ? 1 : matched.length / required.length;
}

/** Cellule unifiée (sortie IA ou parsing template). */
export type Cell = {
  value: string | null;
  error: string | null;
  auto_corrected: boolean;
  original: string | null;
};

export type AnalyzedRow = Record<string, Cell>;

export type AnalysisResult = {
  mapping: Record<string, string>;
  rows: AnalyzedRow[];
  corrections: Array<{ field: string; original: string; corrected: string; count: number }>;
  summary: { total: number; valid: number; to_fix: number };
};

export const PLANNING_MAX_ROWS = 50;
export const ENTITY_MAX_ROWS = 500;
export const RECURRENCE_OCCURRENCE_CAP = 200;
