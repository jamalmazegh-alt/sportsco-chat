// Agrégateur — fusionne les collecteurs et calcule le status.
// Logique pure déléguée à ./pure (testable sans React).

import { useMemo } from "react";
import { useConvocationUrgencies } from "./use-convocation-urgencies";
import { useAbsenceUrgencies } from "./use-absence-urgencies";
import { mergeUrgencies, computeStatus } from "./pure";
import type { UrgencyItem, UrgencyStatus } from "./types";

export type UseUrgenciesResult = {
  items: UrgencyItem[];
  status: UrgencyStatus;
};

export function useUrgencies(): UseUrgenciesResult {
  const conv = useConvocationUrgencies();
  const abs = useAbsenceUrgencies();

  return useMemo<UseUrgenciesResult>(() => {
    const items = mergeUrgencies([conv.items, abs.items]);
    const status = computeStatus([
      { source: "convocation-silence", isPending: conv.isPending, failed: conv.failed },
      { source: "reduced-squad", isPending: abs.isPending, failed: abs.failed },
    ]);
    return { items, status };
  }, [conv.items, abs.items, conv.failed, abs.failed, conv.isPending, abs.isPending]);
}
