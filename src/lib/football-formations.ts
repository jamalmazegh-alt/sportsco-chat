// Football formations for the lineup builder (V1).
// Coordinates are percentages on a vertical half-pitch:
//   x: 0 (left) → 100 (right)
//   y: 0 (top, opposite goal) → 100 (bottom, own goal / GK line)

export type SlotRole = "GK" | "DEF" | "MID" | "FWD";

export interface FormationSlot {
  id: string;
  role: SlotRole;
  x: number;
  y: number;
}

export type FormationKey = "4-4-2" | "4-3-3" | "4-2-3-1" | "3-5-2" | "3-4-3" | "custom";

export const FORMATIONS: { key: FormationKey; label: string }[] = [
  { key: "4-4-2", label: "4-4-2" },
  { key: "4-3-3", label: "4-3-3" },
  { key: "4-2-3-1", label: "4-2-3-1" },
  { key: "3-5-2", label: "3-5-2" },
  { key: "3-4-3", label: "3-4-3" },
  { key: "custom", label: "custom" },
];

// Helper to spread N slots evenly on a row.
function row(role: SlotRole, n: number, y: number, prefix: string): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (let i = 0; i < n; i++) {
    const x = ((i + 1) / (n + 1)) * 100;
    slots.push({ id: `${prefix}${i + 1}`, role, x, y });
  }
  return slots;
}

const GK_Y = 90;

export function formationSlots(formation: FormationKey): FormationSlot[] {
  const gk: FormationSlot = { id: "gk", role: "GK", x: 50, y: GK_Y };
  switch (formation) {
    case "4-4-2":
      return [
        gk,
        ...row("DEF", 4, 70, "d"),
        ...row("MID", 4, 45, "m"),
        ...row("FWD", 2, 18, "f"),
      ];
    case "4-3-3":
      return [
        gk,
        ...row("DEF", 4, 70, "d"),
        ...row("MID", 3, 45, "m"),
        ...row("FWD", 3, 18, "f"),
      ];
    case "4-2-3-1":
      return [
        gk,
        ...row("DEF", 4, 72, "d"),
        ...row("MID", 2, 55, "m"),
        ...row("MID", 3, 35, "am"),
        { id: "f1", role: "FWD", x: 50, y: 15 },
      ];
    case "3-5-2":
      return [
        gk,
        ...row("DEF", 3, 70, "d"),
        ...row("MID", 5, 45, "m"),
        ...row("FWD", 2, 18, "f"),
      ];
    case "3-4-3":
      return [
        gk,
        ...row("DEF", 3, 70, "d"),
        ...row("MID", 4, 45, "m"),
        ...row("FWD", 3, 18, "f"),
      ];
    case "custom":
      return [gk];
  }
}
