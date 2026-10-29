import { EMOTIONS_BY_KEY, type EmotionKey } from "./emotions.ts";

export const PUBLIC_SITE_URL = "https://feeltheworld.lovable.app";
export type ShareLanguage = "en" | "sk";
export type FeelingSearch = { feeling?: EmotionKey; lang?: ShareLanguage };

export function parseSharedFeeling(value: unknown): EmotionKey | undefined {
  return typeof value === "string" && Object.hasOwn(EMOTIONS_BY_KEY, value)
    ? (value as EmotionKey)
    : undefined;
}

export function parseShareLanguage(value: unknown): ShareLanguage | undefined {
  return value === "en" || value === "sk" ? value : undefined;
}

// Always construct a fresh root URL. Never forward a message, coordinates,
// identifiers, query parameters or fragments from the sender's current page.
export function createFeelingLink(base: string, emotion: EmotionKey, language: ShareLanguage) {
  const url = new URL("/", base);
  if (url.protocol !== "https:") throw new Error("Share links require HTTPS");
  url.username = "";
  url.password = "";
  url.searchParams.set("feeling", emotion);
  url.searchParams.set("lang", language);
  return url.toString();
}

export type FeelingShareEvent =
  | "card_opened"
  | "link_copied"
  | "native_completed"
  | "image_downloaded"
  | "invite_opened"
  | "invite_accepted"
  | "invite_submitted";

// An integration point, not an analytics service: nothing is sent or persisted.
export function reportFeelingShare(action: FeelingShareEvent, emotion: EmotionKey) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("feel:share", { detail: { action, emotion } }));
  }
}

type ShareNavigator = Partial<Pick<Navigator, "share" | "canShare">>;
export async function shareFeeling(
  target: ShareNavigator,
  payload: { title: string; text: string; url: string },
  file?: File,
): Promise<"shared" | "cancelled" | "unavailable"> {
  if (typeof target.share !== "function") return "unavailable";
  let canShareFile = false;
  try {
    canShareFile = Boolean(
      file && typeof target.canShare === "function" && target.canShare({ files: [file] }),
    );
  } catch {
    /* Capability probes can fail; keep URL sharing available. */
  }
  try {
    await target.share(canShareFile && file ? { ...payload, files: [file] } : payload);
    return "shared";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    // Some targets accept images or URLs, but not both in one share request.
    if (
      canShareFile &&
      error instanceof Error &&
      ["TypeError", "DataError", "NotSupportedError"].includes(error.name)
    ) {
      try {
        await target.share(payload);
        return "shared";
      } catch (retryError) {
        if (retryError instanceof Error && retryError.name === "AbortError") return "cancelled";
      }
    }
    return "unavailable";
  }
}
