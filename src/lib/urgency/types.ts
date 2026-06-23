// Urgency model — single shape for the "Centre d'urgence" surface.
// Pure types: no React, no Supabase. Sérialisable, testable en isolation.

export type UrgencySource = "convocation-silence" | "reduced-squad";

export type UrgencyRole = "coach" | "player" | "parent";

export type UrgencySeverity = "critical" | "high" | "medium";

// Actions encodées en descripteurs typés (pas de closures dans le modèle).
// Le dispatcher mappe kind → handler côté UI.
export type UrgencyAction =
  | { kind: "remind-all"; eventId: string }
  | { kind: "remind-one"; convocationId: string }
  | { kind: "respond"; eventId: string }
  | { kind: "open-event"; eventId: string }
  | { kind: "open-player"; playerId: string };

export type UrgencyItem = {
  // Clé stable, doit suffire au dedup inter-collecteurs.
  // Convention : `${source}:${sourceId}:${role}`.
  // Pour convocation-silence côté parent multi-enfants, sourceId = eventId
  // (un parent avec 2 gosses non-répondus sur le même match = 1 item).
  id: string;
  source: UrgencySource;
  sourceId: string;
  severity: UrgencySeverity;
  role: UrgencyRole;
  title: string;
  subtitle: string;
  // ISO — date du prochain événement à risque. Tri secondaire stable
  // y compris pour les sources fenêtrées (reduced-squad sur 14j ancré
  // sur le prochain événement concerné).
  anchorAt: string;
  primaryAction: UrgencyAction;
  secondaryAction?: UrgencyAction;
};

// Status à deux dimensions — encode indépendamment "ça charge encore"
// et "qu'est-ce qui a échoué". Évite la collision enum plat ↔ rendu partiel.
export type UrgencyStatus = {
  phase: "pending" | "settled";
  failedSources: UrgencySource[]; // [] si tout OK
};

// Lattice de surface (consommé par UrgencyCenter, ici en commentaire
// pour figer le contrat) :
//   phase === 'pending'                                            → skeleton
//   settled · failed ≠ ∅ · items = ∅                              → bandeau erreur + retry
//   settled · failed ≠ ∅ · items ≠ ∅                              → liste + liseré "sources indisponibles"
//   settled · failed = ∅ · items = ∅                              → SuccessBanner
//   settled · failed = ∅ · items ≠ ∅                              → UrgencyList

export type UrgencyCollectorResult = {
  items: UrgencyItem[];
  failed: boolean;
};

export const SEVERITY_ORDER: Record<UrgencySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};
