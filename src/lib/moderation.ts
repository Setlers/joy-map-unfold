// Shared moderation rules used on both client and server.

export const MAX_MESSAGE_LENGTH = 120;
export const RATE_LIMIT_MS = 60_000; // 1 submission per minute

// Conservative wordlist covering common profanity and slurs.
// Kept short on purpose — the goal is friendly nudging, not perfect filtering.
const BLOCKED_WORDS = [
  // profanity
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cock", "pussy",
  "cunt", "wank", "twat", "slut", "whore", "motherfucker",
  // hate / slurs (non-exhaustive; intentionally generic stems)
  "nigger", "nigga", "faggot", "fag", "retard", "tranny", "kike", "spic",
  "chink", "gook", "wetback", "raghead", "towelhead",
];

const URL_REGEX = /\b((?:https?:\/\/|www\.)\S+|\S+\.(?:com|net|org|io|co|app|dev|xyz|ly|gg|me|info|biz|ru|cn|tv|us|uk|de|fr|es|it|nl|jp|br|in|au|ca)\b\S*)/i;

// Detects obvious spam patterns: long repeated chars, repeated words, shouting.
function isSpammy(text: string): boolean {
  if (/(.)\1{6,}/i.test(text)) return true; // aaaaaaaa
  if (/\b(\w{2,})\b(?:\s+\1\b){3,}/i.test(text)) return true; // word word word word
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) return true;
  return false;
}

function containsBlockedWord(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/\$/g, "s")
    .replace(/[^a-z\s]/g, " ");
  return BLOCKED_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(normalized));
}

export type ModerationResult =
  | { ok: true; clean: string }
  | { ok: false; reason: string };

/** Validates a message. Returns either a sanitized message or a friendly reason. */
export function moderateMessage(input: string | null | undefined): ModerationResult {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) return { ok: true, clean: "" }; // empty is allowed

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: `Please keep it under ${MAX_MESSAGE_LENGTH} characters.` };
  }
  if (URL_REGEX.test(trimmed)) {
    return { ok: false, reason: "Links aren't allowed — share a feeling, not a URL." };
  }
  if (containsBlockedWord(trimmed)) {
    return { ok: false, reason: "Let's keep it kind. Try rephrasing without harsh words." };
  }
  if (isSpammy(trimmed)) {
    return { ok: false, reason: "That looks like spam. Try a calmer note." };
  }

  return { ok: true, clean: trimmed };
}
