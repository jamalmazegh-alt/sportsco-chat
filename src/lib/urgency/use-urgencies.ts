// Agrégateur — fusionne les collecteurs et calcule le status.
// Logique pure déléguée à ./pure (testable sans React).

import { useMemo } from "react";
import { useConvocationUrgencies } from "./use-convocation-urgencies";
import { useAbsenceUrgencies } from "./use-absence-urgencies";
import { useNeedUrgencies } from "./use-need-urgencies";
import { useStaffCoverageUrgencies } from "./use-staff-coverage-urgencies";
import { mergeUrgencies, computeStatus } from "./pure";
import type { UrgencyItem, UrgencyStatus } from "./types";

export type UseUrgenciesResult = {
  items: UrgencyItem[];
  status: UrgencyStatus;
};

export function useUrgencies(): UseUrgenciesResult {
  const conv = useConvocationUrgencies();
  const abs = useAbsenceUrgencies();
  const needs = useNeedUrgencies();
  const coverage = useStaffCoverageUrgencies();

  return useMemo<UseUrgenciesResult>(() => {
    const items = mergeUrgencies([conv.items, abs.items, needs.items, coverage.items]);
    const status = computeStatus([
      { source: "convocation-silence", isPending: conv.isPending, failed: conv.failed },
      { source: "reduced-squad", isPending: abs.isPending, failed: abs.failed },
      { source: "open-need", isPending: needs.isPending, failed: needs.failed },
      { source: "staff-uncovered", isPending: coverage.isPending, failed: coverage.failed },
    ]);
    return { items, status };
  }, [
    conv.items,
    abs.items,
    needs.items,
    coverage.items,
    conv.failed,
    abs.failed,
    needs.failed,
    coverage.failed,
    conv.isPending,
    abs.isPending,
    needs.isPending,
    coverage.isPending,
  ]);
}
