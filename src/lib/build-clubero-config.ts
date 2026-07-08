// Configuration IMMUABLE des questions du feedback "Construisons Clubero".
// `key` et `option.id` ne doivent JAMAIS changer : ils servent aux vues et aux
// stats côté superadmin. Seuls les libellés passent par i18n (t('buildClubero.…')).

export type QuestionType = "single" | "multi" | "icon" | "rating" | "slider" | "rank" | "text";

interface OptionBase {
  id: string;
  emoji?: string;
}

interface SingleQuestion {
  key: string;
  type: "single";
  optional?: boolean;
  options: OptionBase[];
}
interface MultiQuestion {
  key: string;
  type: "multi";
  optional?: boolean;
  max?: number;
  options: OptionBase[];
}
interface IconQuestion {
  key: string;
  type: "icon";
  optional?: boolean;
  options: OptionBase[];
}
interface RatingQuestion {
  key: string;
  type: "rating";
  optional?: boolean;
  scale: { v: number; emoji: string }[];
}
interface SliderQuestion {
  key: string;
  type: "slider";
  optional?: boolean;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  format?: (v: number) => string;
}
interface RankQuestion {
  key: string;
  type: "rank";
  optional?: boolean;
  options: OptionBase[];
}
interface TextQuestion {
  key: string;
  type: "text";
  optional?: boolean;
  maxLength: number;
}

export type Question =
  | SingleQuestion
  | MultiQuestion
  | IconQuestion
  | RatingQuestion
  | SliderQuestion
  | RankQuestion
  | TextQuestion;

export const QUESTIONS: Question[] = [
  {
    key: "audience",
    type: "single",
    options: [
      { id: "kids" },
      { id: "teens" },
      { id: "adults" },
      { id: "mix" },
    ],
  },
  {
    key: "sport",
    type: "icon",
    options: [
      { id: "football", emoji: "⚽" },
      { id: "basket", emoji: "🏀" },
      { id: "hand", emoji: "🤾" },
      { id: "volley", emoji: "🏐" },
      { id: "rugby", emoji: "🏉" },
      { id: "other", emoji: "✨" },
    ],
  },
  {
    key: "timesinks",
    type: "multi",
    max: 3,
    options: [
      { id: "convocations" },
      { id: "presence" },
      { id: "parents" },
      { id: "payments" },
      { id: "planning" },
      { id: "results" },
    ],
  },
  {
    key: "hours",
    type: "slider",
    min: 0,
    max: 15,
    step: 1,
    defaultValue: 4,
  },
  {
    key: "satisfaction",
    type: "rating",
    scale: [
      { v: 1, emoji: "😖" },
      { v: 2, emoji: "😕" },
      { v: 3, emoji: "😐" },
      { v: 4, emoji: "🙂" },
      { v: 5, emoji: "😍" },
    ],
  },
  {
    key: "priorities",
    type: "rank",
    options: [
      { id: "ai_report", emoji: "🧠" },
      { id: "challenges", emoji: "🎯" },
      { id: "matchday", emoji: "🤝" },
      { id: "funding", emoji: "💰" },
      { id: "wall", emoji: "📣" },
      { id: "player_social_network", emoji: "🌐" },
      { id: "public_player_profiles", emoji: "👤" },
      { id: "payments_dues", emoji: "💳" },
      { id: "fundraising", emoji: "🎁" },
    ],
  },
  {
    key: "currenttool",
    type: "single",
    options: [
      { id: "whatsapp" },
      { id: "excel" },
      { id: "app" },
      { id: "nothing" },
    ],
  },
  {
    key: "onewish",
    type: "text",
    optional: true,
    maxLength: 160,
  },
];

export const TOTAL_QUESTIONS = QUESTIONS.length;

// ---------- Helpers purs (testables) ----------

export function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function emailOk(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export function isAnswered(q: Question, value: unknown): boolean {
  if (q.optional) return true;
  switch (q.type) {
    case "multi":
      return Array.isArray(value) && value.length > 0;
    case "rank":
      return Array.isArray(value) && value.length > 0;
    case "slider":
      return typeof value === "number";
    case "single":
    case "icon":
      return typeof value === "string" && value.length > 0;
    case "rating":
      return typeof value === "number" && value > 0;
    case "text":
      return typeof value === "string" && value.trim().length > 0;
  }
}

export type AnswersMap = Record<string, unknown>;

export type ContactPayload = {
  first_name: string | null;
  email: string | null;
  phone: string | null;
  club: string | null;
  newsletter: boolean;
  beta: boolean;
} | null;

export interface ContactFormValues {
  first_name: string;
  email: string;
  phone: string;
  club: string;
  newsletter: boolean;
  beta: boolean;
}

/** Retourne le payload à envoyer à `complete_build_clubero_response`. */
export function buildContactPayload(v: ContactFormValues): ContactPayload {
  if (!v.newsletter && !v.beta) return null;
  return {
    first_name: v.first_name.trim() || null,
    email: v.email.trim() || null,
    phone: v.phone.trim() || null,
    club: v.club.trim() || null,
    newsletter: !!v.newsletter,
    beta: !!v.beta,
  };
}

/** true si l'email est requis (au moins un opt-in coché) et valide. */
export function isContactValid(v: ContactFormValues): boolean {
  if (!v.newsletter && !v.beta) return true;
  return emailOk(v.email);
}

/** UTM basiques à envoyer au backend (JSONB). */
export function parseUtm(search: string): Record<string, string> | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
