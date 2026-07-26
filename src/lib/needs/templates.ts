/**
 * LOT 1 — Bibliothèque de besoins événementiels « Coups de main ».
 *
 * `role_key` = identifiant stable stocké dans event_needs.role_key.
 * `labelKey` = clé i18n dans le namespace `needs.templates.*`. Elle est
 * résolue côté UI (wizard, listes) ET côté e-mail (React Email lit
 * `t('needs.templates.<key>')` selon la langue du destinataire). Jamais
 * de libellé en dur dans les templates.
 *
 * `sports` : 'all' = universel, sinon liste de sports gérés par le club.
 * Sport inconnu → seuls les templates 'all' sont proposés (fallback fait
 * dans le wizard).
 */

export type NeedTemplateKey =
  // Football
  | "ref_center"
  | "ref_line"
  | "delegate"
  // Basket
  | "scoretable"
  | "timekeeper"
  | "scorer"
  | "shotclock_24"
  // Handball
  | "table_secretary"
  | "timekeeper_handball"
  // Volley
  | "line_judge"
  | "setup_volley"
  // Universels
  | "concession"
  | "welcome"
  | "setup"
  | "teardown"
  | "photographer"
  | "animation"
  | "other";

export interface NeedTemplate {
  key: NeedTemplateKey;
  labelKey: string; // needs.templates.<key>
  icon: string; // lucide icon name
  sports: "all" | readonly string[];
  suggestedCapacity?: number;
  suggestedValidationMode?: "auto" | "manual";
}

/** Sport slugs acceptés (alignés sur `clubs.sport` / `teams.sport`). */
export const NEEDS_SUPPORTED_SPORTS = ["football", "basketball", "handball", "volleyball"] as const;

export const NEED_TEMPLATES: readonly NeedTemplate[] = [
  // ---- Football ---------------------------------------------------------
  {
    key: "ref_center",
    labelKey: "needs.templates.ref_center",
    icon: "Whistle",
    sports: ["football"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },
  {
    key: "ref_line",
    labelKey: "needs.templates.ref_line",
    icon: "Flag",
    sports: ["football"],
    suggestedCapacity: 2,
    suggestedValidationMode: "manual",
  },
  {
    key: "delegate",
    labelKey: "needs.templates.delegate",
    icon: "ClipboardList",
    sports: ["football"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },

  // ---- Basket ----------------------------------------------------------
  {
    key: "scoretable",
    labelKey: "needs.templates.scoretable",
    icon: "Table",
    sports: ["basketball"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },
  {
    key: "timekeeper",
    labelKey: "needs.templates.timekeeper",
    icon: "Timer",
    sports: ["basketball"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },
  {
    key: "scorer",
    labelKey: "needs.templates.scorer",
    icon: "PencilLine",
    sports: ["basketball"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },
  {
    key: "shotclock_24",
    labelKey: "needs.templates.shotclock_24",
    icon: "Hourglass",
    sports: ["basketball"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },

  // ---- Handball --------------------------------------------------------
  {
    key: "table_secretary",
    labelKey: "needs.templates.table_secretary",
    icon: "ClipboardEdit",
    sports: ["handball"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },
  {
    key: "timekeeper_handball",
    labelKey: "needs.templates.timekeeper_handball",
    icon: "Timer",
    sports: ["handball"],
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },

  // ---- Volley ----------------------------------------------------------
  {
    key: "line_judge",
    labelKey: "needs.templates.line_judge",
    icon: "Flag",
    sports: ["volleyball"],
    suggestedCapacity: 2,
    suggestedValidationMode: "manual",
  },
  {
    key: "setup_volley",
    labelKey: "needs.templates.setup_volley",
    icon: "Wrench",
    sports: ["volleyball"],
    suggestedCapacity: 2,
    suggestedValidationMode: "auto",
  },

  // ---- Universels ------------------------------------------------------
  {
    key: "concession",
    labelKey: "needs.templates.concession",
    icon: "CupSoda",
    sports: "all",
    suggestedCapacity: 2,
    suggestedValidationMode: "auto",
  },
  {
    key: "welcome",
    labelKey: "needs.templates.welcome",
    icon: "Handshake",
    sports: "all",
    suggestedCapacity: 1,
    suggestedValidationMode: "auto",
  },
  {
    key: "setup",
    labelKey: "needs.templates.setup",
    icon: "Wrench",
    sports: "all",
    suggestedCapacity: 2,
    suggestedValidationMode: "auto",
  },
  {
    key: "teardown",
    labelKey: "needs.templates.teardown",
    icon: "PackageOpen",
    sports: "all",
    suggestedCapacity: 2,
    suggestedValidationMode: "auto",
  },
  {
    key: "photographer",
    labelKey: "needs.templates.photographer",
    icon: "Camera",
    sports: "all",
    suggestedCapacity: 1,
    suggestedValidationMode: "auto",
  },
  {
    key: "animation",
    labelKey: "needs.templates.animation",
    icon: "Music",
    sports: "all",
    suggestedCapacity: 1,
    suggestedValidationMode: "auto",
  },
  {
    key: "other",
    labelKey: "needs.templates.other",
    icon: "Sparkles",
    sports: "all", // toujours proposé
    suggestedCapacity: 1,
    suggestedValidationMode: "manual",
  },
] as const;

/**
 * Retourne les templates proposés pour un sport donné.
 * - Sport connu : templates spécifiques ∪ universels.
 * - Sport inconnu / null : universels seuls (invariant : "Autre besoin" toujours proposé).
 */
export function getNeedTemplatesForSport(sport: string | null | undefined): NeedTemplate[] {
  const normalized = (sport ?? "").toLowerCase().trim();
  const known = (NEEDS_SUPPORTED_SPORTS as readonly string[]).includes(normalized);
  return NEED_TEMPLATES.filter((tpl) => {
    if (tpl.sports === "all") return true;
    return known && tpl.sports.includes(normalized);
  });
}

/** Résolution stricte pour lookup côté serveur (persistance role_key). */
export function findNeedTemplate(roleKey: string): NeedTemplate | undefined {
  return NEED_TEMPLATES.find((t) => t.key === roleKey);
}
