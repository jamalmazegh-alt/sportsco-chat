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
const isIsoDate = (v: string | null): string | null => {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "Date attendue YYYY-MM-DD";
};
const isHHMM = (v: string | null): string | null => {
  if (!v) return null;
  return /^\d{2}:\d{2}$/.test(v) ? null : "Heure attendue HH:MM";
};
const inSet = (set: string[]) => (v: string | null): string | null => {
  if (!v) return null;
  return set.includes(v) ? null : `Valeur attendue : ${set.join(", ")}`;
};

export const PLAYER_FIELDS: FieldDef[] = [
  { key: "equipe", label: "Équipe", required: true },
  { key: "sport", label: "Sport", required: true },
  { key: "categorie", label: "Catégorie", required: true },
  { key: "genre", label: "Genre", required: false, validate: inSet(["Masculin", "Féminin", "Mixte"]) },
  { key: "saison", label: "Saison", required: false },
  { key: "prenom_joueur", label: "Prénom joueur", required: true },
  { key: "nom_joueur", label: "Nom joueur", required: true },
  { key: "date_naissance", label: "Date de naissance", required: true, validate: isIsoDate },
  { key: "numero_maillot", label: "N° maillot", required: false },
  { key: "poste", label: "Poste", required: false },
  { key: "email_contact", label: "Email contact", required: false, validate: isEmail },
  { key: "prenom_parent_1", label: "Prénom parent 1", required: false },
  { key: "nom_parent_1", label: "Nom parent 1", required: false },
  { key: "email_parent_1", label: "Email parent 1", required: false, validate: isEmail },
  { key: "telephone_parent_1", label: "Téléphone parent 1", required: false },
  { key: "lien_parent_1", label: "Lien parent 1", required: false, validate: inSet(["Père", "Mère", "Tuteur"]) },
  { key: "prenom_parent_2", label: "Prénom parent 2", required: false },
  { key: "nom_parent_2", label: "Nom parent 2", required: false },
  { key: "email_parent_2", label: "Email parent 2", required: false, validate: isEmail },
  { key: "telephone_parent_2", label: "Téléphone parent 2", required: false },
  { key: "lien_parent_2", label: "Lien parent 2", required: false, validate: inSet(["Père", "Mère", "Tuteur"]) },
];

export const COACH_FIELDS: FieldDef[] = [
  { key: "equipe", label: "Équipe", required: true },
  { key: "sport", label: "Sport", required: true },
  { key: "categorie", label: "Catégorie", required: true },
  { key: "genre", label: "Genre", required: false, validate: inSet(["Masculin", "Féminin", "Mixte"]) },
  { key: "saison", label: "Saison", required: false },
  { key: "prenom", label: "Prénom", required: true },
  { key: "nom", label: "Nom", required: true },
  { key: "email", label: "Email", required: true, validate: isEmail },
  { key: "telephone", label: "Téléphone", required: false },
  { key: "role", label: "Rôle", required: true, validate: inSet(["coach", "assistant_coach", "manager"]) },
];

const PLANNING_TYPES = ["Entraînement", "Match", "Tournoi", "Réunion"];
const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const validateRecurrence = (v: string | null): string | null => {
  if (!v) return null;
  const parts = v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
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
  { key: "domicile", label: "Domicile/Extérieur", required: false, validate: inSet(["Domicile", "Extérieur"]) },
  { key: "recurrence_jours", label: "Jours récurrence", required: false, validate: validateRecurrence },
  { key: "recurrence_fin", label: "Fin récurrence", required: false, validate: isIsoDate },
];

export function getFields(type: ImportType): FieldDef[] {
  if (type === "players") return PLAYER_FIELDS;
  if (type === "coaches") return COACH_FIELDS;
  return PLANNING_FIELDS;
}

/** Compteur de colonnes obligatoires présentes — sert au seuil 80% de détection template. */
export function templateMatchRatio(headers: string[], type: ImportType): number {
  const fields = getFields(type);
  const required = fields.filter((f) => f.required);
  const norm = headers.map((h) => h.toLowerCase().replace(/\s+/g, "").replace(/[éèê]/g, "e"));
  const matched = required.filter((f) =>
    norm.includes(f.key.toLowerCase().replace(/\s+/g, "").replace(/[éèê]/g, "e")),
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
