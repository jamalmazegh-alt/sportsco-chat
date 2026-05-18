// Sport-aware feedback tag catalog.
// Tag IDs are stable (English, snake_case) — translations live in locale files
// under `feedback.tag.<id>`. Add a fallback to the raw id if a translation is missing.

const COMMON_TAGS = [
  "effort",
  "mentality",
  "leadership",
  "teamwork",
  "discipline",
  "communication",
  "attitude",
  "focus",
  "physical",
  "technical",
];

const SPORT_TAGS: Record<string, string[]> = {
  football: [
    "positioning",
    "passing",
    "dribbling",
    "defending",
    "finishing",
    "set_pieces",
    "pressing",
    "transition",
    "first_touch",
    "vision",
  ],
  futsal: [
    "positioning",
    "passing",
    "finishing",
    "pressing",
    "transition",
    "first_touch",
  ],
  basketball: [
    "shooting",
    "rebounding",
    "defending",
    "ball_handling",
    "court_vision",
    "pick_and_roll",
    "transition",
    "spacing",
  ],
  handball: [
    "shooting",
    "defending",
    "passing",
    "pivot_play",
    "fast_break",
    "set_play",
  ],
  volleyball: [
    "serving",
    "reception",
    "setting",
    "attacking",
    "blocking",
    "defense",
  ],
  rugby: [
    "tackling",
    "rucking",
    "passing",
    "kicking",
    "line_out",
    "scrum",
    "defending",
  ],
  hockey: [
    "skating",
    "shooting",
    "passing",
    "defending",
    "puck_handling",
    "positioning",
  ],
};

function normalizeSport(sport?: string | null): string | null {
  if (!sport) return null;
  const s = sport.toLowerCase().trim();
  if (["soccer", "football", "foot"].includes(s)) return "football";
  if (["basket", "basketball"].includes(s)) return "basketball";
  if (["hand", "handball"].includes(s)) return "handball";
  if (["volley", "volleyball"].includes(s)) return "volleyball";
  if (["rugby"].includes(s)) return "rugby";
  if (["hockey", "ice_hockey"].includes(s)) return "hockey";
  if (["futsal"].includes(s)) return "futsal";
  return s;
}

export function getFeedbackTagsForSport(sport?: string | null): string[] {
  const key = normalizeSport(sport);
  const sportTags = (key && SPORT_TAGS[key]) || [];
  // Sport-specific first, then common
  return [...sportTags, ...COMMON_TAGS];
}
