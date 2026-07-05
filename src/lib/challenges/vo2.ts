/**
 * VO₂ max helpers.
 *
 * Pure functions — no DB, no side effects. Server-side computation lives in
 * `challenges.functions.ts`; these helpers keep the formulas testable and
 * shareable between server and client.
 *
 * Formulas
 * --------
 * Luc Léger (20 m shuttle) : speed_kmh = 8 + 0.5 * (stage - 1),
 *                            VO₂ = 3.5 × speed_kmh (ml·kg⁻¹·min⁻¹).
 * Cooper 12 min           : VO₂ = (distance_m - 504.9) / 44.73.
 * Youth correction factor : applied on top of raw VO₂ for U-15 and below
 *                           (rough proxy — see docs, tunable).
 */

export function speedKmhForStage(stage: number): number {
  return 8 + 0.5 * (stage - 1);
}

export function vo2Leger(stage: number): number {
  return round2(3.5 * speedKmhForStage(stage));
}

export function vo2Cooper(distanceM: number): number {
  return round2((distanceM - 504.9) / 44.73);
}

export function vo2AgeFactor(age: number | null | undefined): number {
  if (age == null) return 1;
  if (age <= 10) return 0.9;
  if (age <= 12) return 0.94;
  if (age <= 14) return 0.98;
  return 1;
}

export function ageFromBirthDate(birthDate: string | null | undefined, ref = new Date()): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age -= 1;
  return age;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
