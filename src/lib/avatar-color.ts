/**
 * Deterministic vibrant gradient placeholders from any string (name, id…).
 * Used to replace flat gray avatar/team placeholders with a more emotional,
 * brand-friendly visual identity. Stable across renders: same input → same gradient.
 */

// Curated pairs that look good in both light & dark themes.
// Pure Tailwind classes, no custom CSS, no extra deps.
const GRADIENTS: { from: string; to: string; text: string }[] = [
  { from: "from-indigo-500", to: "to-fuchsia-500", text: "text-white" },
  { from: "from-emerald-500", to: "to-teal-500", text: "text-white" },
  { from: "from-amber-500", to: "to-rose-500", text: "text-white" },
  { from: "from-sky-500", to: "to-indigo-600", text: "text-white" },
  { from: "from-fuchsia-500", to: "to-pink-600", text: "text-white" },
  { from: "from-cyan-500", to: "to-blue-600", text: "text-white" },
  { from: "from-lime-500", to: "to-emerald-600", text: "text-white" },
  { from: "from-orange-500", to: "to-red-500", text: "text-white" },
  { from: "from-violet-500", to: "to-purple-600", text: "text-white" },
  { from: "from-rose-500", to: "to-orange-500", text: "text-white" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function avatarGradient(seed: string | null | undefined): string {
  const key = (seed ?? "").trim() || "?";
  const g = GRADIENTS[hash(key) % GRADIENTS.length];
  return `bg-gradient-to-br ${g.from} ${g.to} ${g.text}`;
}

export function initialsFrom(...parts: (string | null | undefined)[]): string {
  const letters = parts
    .map((p) => (p ?? "").trim()[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return letters.slice(0, 2) || "?";
}
