import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sk";

type Dict = Record<string, string>;

const en: Dict = {
  "live.feelings": "Live · {count} feelings dropped",
  "hero.title": "Feel the\u00a0world.",
  "hero.subtitle": "Anonymous. Pick an emotion, optionally leave a short note, then tap the map.",
  "mood.today": "· today",
  "mood.joy": "The world feels joyful today.",
  "mood.calm": "The world feels calm today.",
  "mood.sadness": "The world feels tender today.",
  "mood.anger": "The world feels restless today.",
  "mood.anxiety": "The world feels anxious today.",
  "mood.hope": "The world feels hopeful today.",
  "toggle.heatmap": "Heatmap",
  "toggle.points": "Points",
  "whisper.label": "· whisper",
  "composer.placeholder": "Say something (optional, anonymous)…",
  "composer.aria": "Optional anonymous message",
  "toast.breath.title": "Take a breath",
  "toast.breath.desc": "Try again in {sec}s.",
  "toast.nudge.title": "A gentle nudge",
  "toast.dropped": "{emoji} {label} dropped",
  "toast.error": "Couldn't drop your feeling. Try again.",
  "mod.too_long": "Please keep it under {max} characters.",
  "mod.no_links": "Links aren't allowed — share a feeling, not a URL.",
  "mod.profanity": "Let's keep it kind. Try rephrasing without harsh words.",
  "mod.spam": "That looks like spam. Try a calmer note.",
  "mod.rate": "Take a breath — try again in {sec}s.",
  "mod.duplicate": "Someone just shared that exact thought. Try your own words.",
  "mod.save_failed": "Couldn't save your feeling. Try again.",
  // Emotion labels
  "emotion.joy": "Joy",
  "emotion.calm": "Calm",
  "emotion.sadness": "Sadness",
  "emotion.anger": "Anger",
  "emotion.anxiety": "Anxiety",
  "emotion.hope": "Hope",
  "tooltip.read": "{emoji} {label} · tap to read",
  "tooltip.simple": "{emoji} {label}",
  "range.live": "Live",
  "range.today": "Today",
  "range.week": "Week",
  "range.all": "All",
  "sound.on": "Sound on",
  "sound.off": "Sound off",
  "onboarding.hint": "Tap anywhere on the map to add your emotion.",
  "onboarding.tapToDismiss": "Tap to continue",
};

const sk: Dict = {
  "live.feelings": "Naživo · {count} pocitov zdieľaných",
  "hero.title": "Cíť\u00a0svet.",
  "hero.subtitle": "Anonymne. Vyber si emóciu, prípadne nechaj krátku poznámku, a klikni na mapu.",
  "mood.today": "· dnes",
  "mood.joy": "Svet sa dnes cíti radostne.",
  "mood.calm": "Svet sa dnes cíti pokojne.",
  "mood.sadness": "Svet sa dnes cíti dojímavo.",
  "mood.anger": "Svet sa dnes cíti nepokojne.",
  "mood.anxiety": "Svet sa dnes cíti úzkostlivo.",
  "mood.hope": "Svet sa dnes cíti nádejne.",
  "toggle.heatmap": "Teplotná mapa",
  "toggle.points": "Body",
  "whisper.label": "· šepot",
  "composer.placeholder": "Povedz niečo (nepovinné, anonymné)…",
  "composer.aria": "Nepovinný anonymný odkaz",
  "toast.breath.title": "Nadýchni sa",
  "toast.breath.desc": "Skús to znova o {sec}s.",
  "toast.nudge.title": "Jemné upozornenie",
  "toast.dropped": "{emoji} {label} pridaná",
  "toast.error": "Nepodarilo sa pridať tvoj pocit. Skús znova.",
  "mod.too_long": "Prosím, maximálne {max} znakov.",
  "mod.no_links": "Odkazy nie sú povolené — zdieľaj pocit, nie URL.",
  "mod.profanity": "Buďme láskaví. Skús to preformulovať bez hrubých slov.",
  "mod.spam": "Vyzerá to ako spam. Skús pokojnejšiu poznámku.",
  "mod.rate": "Nadýchni sa — skús to znova o {sec}s.",
  "mod.duplicate": "Niekto práve zdieľal presne to isté. Skús vlastné slová.",
  "mod.save_failed": "Nepodarilo sa uložiť tvoj pocit. Skús znova.",
  "emotion.joy": "Radosť",
  "emotion.calm": "Pokoj",
  "emotion.sadness": "Smútok",
  "emotion.anger": "Hnev",
  "emotion.anxiety": "Úzkosť",
  "emotion.hope": "Nádej",
  "tooltip.read": "{emoji} {label} · klikni pre čítanie",
  "tooltip.simple": "{emoji} {label}",
  "range.live": "Naživo",
  "range.today": "Dnes",
  "range.week": "Týždeň",
  "range.all": "Všetko",
  "sound.on": "Zvuk zap.",
  "sound.off": "Zvuk vyp.",
  "onboarding.hint": "Klepni kdekoľvek na mapu a pridaj svoju emóciu.",
  "onboarding.tapToDismiss": "Klepni pre pokračovanie",
};

const DICTS: Record<Lang, Dict> = { en, sk };

const STORAGE_KEY = "lang";

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

function detectInitial(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === "en" || stored === "sk") return stored;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Hydrate from storage/nav on the client to avoid SSR mismatch.
  useEffect(() => {
    setLangState(detectInitial());
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = l;
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = (key: string, params?: Record<string, string | number>) => {
    const dict = DICTS[lang] ?? en;
    let s = dict[key] ?? en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  };

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used within LanguageProvider");
  return c;
}
