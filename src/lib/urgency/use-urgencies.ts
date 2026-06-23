// Agrégateur — fusionne les collecteurs, déduplique par id, trie, expose
// un UrgencyStatus à deux dimensions.

import { useMemo } from "react";
import { useConvocationUrgencies } from "./use-convocation-urgencies";
import { useAbsenceUrgencies } from "./use-absence-urgencies";
import {
  SEVERITY_ORDER,
  type UrgencyItem,
  type UrgencySource,
  type UrgencyStatus,
} from "./types";

export type UseUrgenciesResult = {
  items: UrgencyItem[];
  status: UrgencyStatus;
};

export function useUrgencies(): UseUrgenciesResult {
  const conv = useConvocationUrgencies();
  const abs = useAbsenceUrgencies();

  return useMemo<UseUrgenciesResult>(() => {
    // Dedup par id (`${source}:${sourceId}:${role}`). Premier gagne — l'ordre
    // des collecteurs est stable, donc le résultat est déterministe.
    const seen = new Set<string>();
    const merged: UrgencyItem[] = [];
    for (const it of [...conv.items, ...abs.items]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      merged.push(it);
    }
    merged.sort((a, b) => {
      const ds = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (ds !== 0) return ds;
      return a.anchorAt.localeCompare(b.anchorAt);
    });

    const failedSources: UrgencySource[] = [];
    if (conv.failed) failedSources.push("convocation-silence");
    if (abs.failed) failedSources.push("reduced-squad");

    const phase: UrgencyStatus["phase"] =
      conv.isPending || abs.isPending ? "pending" : "settled";

    return { items: merged, status: { phase, failedSources } };
  }, [conv.items, abs.items, conv.failed, abs.failed, conv.isPending, abs.isPending]);
}
