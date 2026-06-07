/**
 * Templates de noms pour les Flights (concept générique, jamais hardcodé).
 *
 * Chaque template fournit jusqu'à 6 noms (A → F) traduits dans les 7 langues
 * supportées par l'app. L'organisateur peut ensuite renommer librement.
 */

export type FlightTemplateId = "champions" | "cup_plate" | "medals" | "custom";

export type Lang = "fr" | "en" | "de" | "es" | "it" | "nl" | "pt";

export interface FlightTemplateName {
  short: string;
  fr: string;
  en: string;
  de: string;
  es: string;
  it: string;
  nl: string;
  pt: string;
  color?: string;
}

export interface FlightTemplate {
  id: FlightTemplateId;
  /** Clé i18n pour le titre du template */
  labelKey: string;
  names: FlightTemplateName[];
}

export const FLIGHT_TEMPLATES: FlightTemplate[] = [
  {
    id: "champions",
    labelKey: "flights.templates.champions",
    names: [
      { short: "A", fr: "Champions", en: "Champions", de: "Champions", es: "Campeones", it: "Champions", nl: "Champions", pt: "Campeões", color: "#FFD700" },
      { short: "B", fr: "Europa", en: "Europa", de: "Europa", es: "Europa", it: "Europa", nl: "Europa", pt: "Europa", color: "#3B82F6" },
      { short: "C", fr: "Conférence", en: "Conference", de: "Konferenz", es: "Conferencia", it: "Conferenza", nl: "Conferentie", pt: "Conferência", color: "#10B981" },
      { short: "D", fr: "Trophée D", en: "Trophy D", de: "Trophäe D", es: "Trofeo D", it: "Trofeo D", nl: "Trofee D", pt: "Troféu D" },
    ],
  },
  {
    id: "cup_plate",
    labelKey: "flights.templates.cup_plate",
    names: [
      { short: "A", fr: "Coupe", en: "Cup", de: "Pokal", es: "Copa", it: "Coppa", nl: "Beker", pt: "Taça", color: "#FFD700" },
      { short: "B", fr: "Plaque", en: "Plate", de: "Platte", es: "Plato", it: "Piatto", nl: "Plaat", pt: "Prato", color: "#C0C0C0" },
      { short: "C", fr: "Bowl", en: "Bowl", de: "Schale", es: "Tazón", it: "Coppa Bowl", nl: "Kom", pt: "Bowl", color: "#CD7F32" },
      { short: "D", fr: "Bouclier", en: "Shield", de: "Schild", es: "Escudo", it: "Scudo", nl: "Schild", pt: "Escudo", color: "#6B7280" },
    ],
  },
  {
    id: "medals",
    labelKey: "flights.templates.medals",
    names: [
      { short: "A", fr: "Or", en: "Gold", de: "Gold", es: "Oro", it: "Oro", nl: "Goud", pt: "Ouro", color: "#FFD700" },
      { short: "B", fr: "Argent", en: "Silver", de: "Silber", es: "Plata", it: "Argento", nl: "Zilver", pt: "Prata", color: "#C0C0C0" },
      { short: "C", fr: "Bronze", en: "Bronze", de: "Bronze", es: "Bronce", it: "Bronzo", nl: "Brons", pt: "Bronze", color: "#CD7F32" },
    ],
  },
];

export function getFlightTemplate(id: FlightTemplateId): FlightTemplate | null {
  return FLIGHT_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function templateNameFor(name: FlightTemplateName, lang: Lang): string {
  return name[lang] ?? name.en;
}
