// Pure logic for the urgency center — no React, no Supabase.
// Extracted so the lattice / merge / status can be table-tested in isolation.

import {
  SEVERITY_ORDER,
  type UrgencyItem,
  type UrgencySource,
  type UrgencyStatus,
} from "./types";

export type SurfaceState = "pending" | "error" | "partial" | "empty" | "list";

/**
 * Lattice de surface (5 branches, mutuellement exclusives).
 * Invariant clé : la branche 'empty' (SuccessBanner) n'est JAMAIS atteinte
 * si `status.failedSources` est non vide — pas de succès si une source a échoué.
 */
export function selectSurfaceState(
  status: UrgencyStatus,
  itemCount: number,
): SurfaceState {
  if (status.phase === "pending") return "pending";
  const hasFailures = status.failedSources.length > 0;
  if (hasFailures && itemCount === 0) return "error";
  if (hasFailures && itemCount > 0) return "partial";
  if (itemCount === 0) return "empty";
  return "list";
}

/**
 * Fusion + dedup par `id` (`${source}:${sourceId}:${role}`) puis tri
 * severity DESC (critical > high > medium) puis anchorAt ASC.
 * L'ordre des tableaux fournis est l'ordre de priorité pour le dedup
 * (premier gagne) → résultat déterministe.
 */
export function mergeUrgencies(itemArrays: UrgencyItem[][]): UrgencyItem[] {
  const seen = new Set<string>();
  const merged: UrgencyItem[] = [];
  for (const arr of itemArrays) {
    for (const it of arr) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      merged.push(it);
    }
  }
  merged.sort((a, b) => {
    const ds = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (ds !== 0) return ds;
    return a.anchorAt.localeCompare(b.anchorAt);
  });
  return merged;
}

export type CollectorStatusInput = {
  source: UrgencySource;
  isPending: boolean;
  failed: boolean;
};

/**
 * Agrège un UrgencyStatus à partir des résultats de collecteurs.
 * Règle : ≥1 pending → phase 'pending' (domine error). Sinon 'settled' avec
 * la liste des sources en échec.
 */
export function computeStatus(results: CollectorStatusInput[]): UrgencyStatus {
  const anyPending = results.some((r) => r.isPending);
  if (anyPending) return { phase: "pending", failedSources: [] };
  const failedSources = results.filter((r) => r.failed).map((r) => r.source);
  return { phase: "settled", failedSources };
}
