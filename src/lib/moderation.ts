// Shared moderation rules used on both client and server.
// Lightweight, fast: regex + normalization. No external deps.

export const MAX_MESSAGE_LENGTH = 120;
export const RATE_LIMIT_MS = 60_000; // 1 submission per minute

// Explicit English + Slovak terms and inflections; never match arbitrary stems.
// Goal is friendly nudging, not perfect filtering.
const BLOCKED_WORDS = [
  "fucker",
  "fuckers",
  "fucking",
  "fucked",
  "motherfuckers",
  "motherfucking",
  "bullshit",
  "shitty",
  "shitting",
  "bitches",
  "assholes",
  "dickhead",
  // --- English profanity ---
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cock",
  "pussy",
  "cunt",
  "wank",
  "twat",
  "slut",
  "whore",
  "motherfucker",
  "jerk",
  // --- English hate / slurs ---
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "tranny",
  "kike",
  "spic",
  "chink",
  "gook",
  "wetback",
  "raghead",
  "towelhead",
  // --- Slovak profanity ---
  "kurva",
  "kurvy",
  "kurvu",
  "kurvou",
  "kurwa",
  "pica",
  "picus",
  "pico",
  "jebat",
  "jeb",
  "jebem",
  "jebnut",
  "vyjeb",
  "zjeb",
  "dojeb",
  "ojeb",
  "kokot",
  "kokoti",
  "kokota",
  "kokotom",
  "kokotsky",
  "mrdat",
  "mrd",
  "mrdka",
  "mrdam",
  "hovno",
  "hovna",
  "hovnar",
  "debil",
  "debilko",
  "debilny",
  "idiot",
  "idioti",
  "sracka",
  "srac",
  "sracko",
  "prdel",
  "prde",
  "skurven",
  "skurveny",
  "skurvena",
  "skurvene",
  "skurvy",
  "skurvysyn",
  "vyjebany",
  "vyjebana",
  "vyjebane",
  "zjebany",
  "dojebany",
  "ojebany",
  "buzerant",
  "buzna",
  "buzi",
  // Identity words such as "zid" and "cernoch" are not inherently abusive.
  "negr",
];

// URLs of all common shapes.
const URL_REGEX =
  /\b((?:https?:\/\/|www\.)\S+|\S+\.(?:com|net|org|io|co|app|dev|xyz|ly|gg|me|info|biz|ru|cn|tv|us|uk|de|fr|es|it|nl|jp|br|in|au|ca|sk|cz|eu)\b\S*)/i;

// Detects obvious spam patterns: long repeated chars, repeated words, shouting.
function isSpammy(text: string): boolean {
  if (/(.)\1{6,}/i.test(text)) return true; // aaaaaaaa
  if (/\b(\w{2,})\b(?:\s+\1\b){3,}/i.test(text)) return true; // word word word word
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) return true;
  return false;
}

// Match whole terms, including spaced/punctuated and common leet variants.
// Keep word boundaries: joining the entire sentence would turn innocent words
// such as "wish it" into a prohibited substring.
const LETTER_VARIANTS: Record<string, string> = {
  a: "[a4@]",
  b: "[b8]",
  e: "[e3]",
  i: "[i1!|]",
  o: "[o0]",
  s: "[s5$]",
  t: "[t7+]",
};
const BETWEEN_LETTERS = String.raw`[\s\p{P}\p{S}\p{Cf}]*`;
const BLOCKED_PATTERNS = [...new Set(BLOCKED_WORDS)].map((word) => {
  const letters = Array.from(word, (letter) => `${LETTER_VARIANTS[letter] ?? letter}+`);
  const variants = [letters.join(BETWEEN_LETTERS)];
  // Allow one explicitly masked interior letter ("f*ck"). Keep masking stars
  // out of its separators to avoid ambiguous wildcard runs and backtracking.
  const maskedSeparator = String.raw`(?:(?![*•])[\s\p{P}\p{S}\p{Cf}])*`;
  for (let index = 1; index < letters.length - 1; index++) {
    const masked = [...letters];
    masked[index] = "[*•]";
    variants.push(masked.join(maskedSeparator));
  }
  return new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${variants.join("|")})(?![\p{L}\p{N}])`, "u");
});

function containsBlockedWord(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
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
