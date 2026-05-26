// Shared moderation rules used on both client and server.
// Lightweight, fast: regex + normalization. No external deps.

export const MAX_MESSAGE_LENGTH = 120;
export const RATE_LIMIT_MS = 60_000; // 1 submission per minute

// English + Slovak profanity / slurs. Kept as stems to catch inflections.
// Goal is friendly nudging, not perfect filtering.
const BLOCKED_WORDS = [
  // --- English profanity ---
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cock", "pussy",
  "cunt", "wank", "twat", "slut", "whore", "motherfucker", "jerk",
  // --- English hate / slurs ---
  "nigger", "nigga", "faggot", "fag", "retard", "tranny", "kike", "spic",
  "chink", "gook", "wetback", "raghead", "towelhead",
  // --- Slovak profanity ---
  "kurva", "kurwa", "pica", "pica", "picus", "pico",
  "jebat", "jeb", "jebem", "jebnut", "vyjeb", "zjeb", "dojeb", "ojeb",
  "kokot", "kokos", "kokoti",
  "mrdat", "mrd", "mrdka", "mrdam",
  "hovno", "hovna", "hovnar",
  "debil", "debilko", "debilny",
  "idiot", "idioti",
  "sracka", "srac", "sracko",
  "prdel", "prde",
  "kar", "skurven", "skurvy", "skurvysyn",
  "buzerant", "buzna", "buzi",
  "cigan", "cigani",
  // --- Slovak hate / slurs ---
  "cernoch", "negr", "zid",
];

// URLs of all common shapes.
const URL_REGEX = /\b((?:https?:\/\/|www\.)\S+|\S+\.(?:com|net|org|io|co|app|dev|xyz|ly|gg|me|info|biz|ru|cn|tv|us|uk|de|fr|es|it|nl|jp|br|in|au|ca|sk|cz|eu)\b\S*)/i;

// Detects obvious spam patterns: long repeated chars, repeated words, shouting.
function isSpammy(text: string): boolean {
  if (/(.)\1{6,}/i.test(text)) return true; // aaaaaaaa
  if (/\b(\w{2,})\b(?:\s+\1\b){3,}/i.test(text)) return true; // word word word word
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) return true;
  return false;
}

// Map common leet / diacritic substitutions to a canonical letter.
// Keeps things fast — one pass character map.
const CHAR_MAP: Record<string, string> = {
  "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b",
  // Slovak diacritics
  "á": "a", "ä": "a", "č": "c", "ď": "d", "é": "e", "ě": "e", "í": "i",
  "ĺ": "l", "ľ": "l", "ň": "n", "ó": "o", "ô": "o", "ŕ": "r", "š": "s",
  "ť": "t", "ú": "u", "ý": "y", "ž": "z",
  // Common typographic
  "‘": "'", "’": "'", "“": '"', "”": '"',
};

/**
 * Normalize text for profanity matching:
 *  - lowercase
 *  - map leet chars + diacritics to base letters
 *  - drop everything that isn't a letter (so "f*u*c*k" and "f u c k" → "fuck")
 *  - collapse runs of repeated letters ("fuuuck" → "fuck")
 */
function normalizeForMatch(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  for (const ch of lower) {
    const mapped = CHAR_MAP[ch] ?? ch;
    if (mapped >= "a" && mapped <= "z") out += mapped;
  }
  // collapse 3+ repeats to 1 ("fuuuuck" → "fuck", "piiica" → "pica")
  return out.replace(/([a-z])\1{2,}/g, "$1");
}

function containsBlockedWord(text: string): boolean {
  // 1) Full normalization — catches spaced ("f u c k"), masked ("f*ck"),
  //    leet ("fuk3r"), diacritic ("piča"), and stretched ("piiicaaa") variants.
  const collapsed = normalizeForMatch(text);
  if (BLOCKED_WORDS.some((w) => collapsed.includes(w))) return true;

  // 2) Also do a softer word-boundary check on a lightly-normalized version,
  //    so legitimate words containing a stem ("classic", "scunthorpe") aren't
  //    affected — only standalone tokens trip this path.
  const tokens = text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$|5/g, "s")
    .split(/[^a-zà-ž]+/i)
    .filter(Boolean);
  return tokens.some((t) => {
    const n = normalizeForMatch(t);
    return BLOCKED_WORDS.includes(n);
  });
}

export type ModerationCode =
  | "too_long"
  | "no_links"
  | "profanity"
  | "spam"
  | "rate"
  | "duplicate"
  | "save_failed";

export type ModerationResult =
  | { ok: true; clean: string }
  | { ok: false; code: ModerationCode; reason: string; params?: Record<string, string | number> };

/** Validates a message. Returns either a sanitized message or a friendly reason + code. */
export function moderateMessage(input: string | null | undefined): ModerationResult {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) return { ok: true, clean: "" }; // empty is allowed

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      code: "too_long",
      reason: `Please keep it under ${MAX_MESSAGE_LENGTH} characters.`,
      params: { max: MAX_MESSAGE_LENGTH },
    };
  }
  if (URL_REGEX.test(trimmed)) {
    return {
      ok: false,
      code: "no_links",
      reason: "Links aren't allowed — share a feeling, not a URL.",
    };
  }
  if (containsBlockedWord(trimmed)) {
    return {
      ok: false,
      code: "profanity",
      reason: "Let's keep it kind. Try rephrasing without harsh words.",
    };
  }
  if (isSpammy(trimmed)) {
    return { ok: false, code: "spam", reason: "That looks like spam. Try a calmer note." };
  }

  return { ok: true, clean: trimmed };
}
