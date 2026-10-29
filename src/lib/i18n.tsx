import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "sk";

type Dict = Record<string, string>;

const en: Dict = {
  "mode.feelings": "Feelings",
  "mode.running": "Running now",
  "run.title": "You’re not training alone.",
  "run.subtitle": "Someone, somewhere, is heading out too. Share your run and cheer each other on.",
  "run.count": "Active training states on the map: {count}",
  "run.loading": "Loading runners…",
  "run.unavailable": "Training updates unavailable",
  "run.empty": "Be the first to light up the map. Someone else may join you.",
  "run.anonymous": "A runner",
  "run.feed.error": "Couldn't refresh runners. Previously loaded points may be outdated.",
  "run.refresh": "Updates refresh automatically.",
  "run.sample": "Showing the latest available training states.",
  "run.map": "Map of active runners",
  "run.map.error": "The map couldn't load.",
  "run.runner": "Runner details",
  "run.close": "Close runner details",
  "run.remaining": "About {min} min remaining",
  "run.cheers": "encouragements",
  "run.cheer": "👏 You’ve got this!",
  "run.cheered": "Encouragement sent",
  "run.controls": "Your training",
  "run.restoring": "Checking your training…",
  "run.owner.error": "Couldn't check your training. Please retry before starting.",
  "run.you.running": "Your training is active",
  "run.owner.note": "You can end this training from this browser.",
  "run.finish": "I’m done",
  "run.share": "Invite someone",
  "run.after": "Run complete. How are you feeling?",
  "run.after.action": "Share my post-run feeling",
  "run.nickname": "Nickname (optional, up to 30 characters)",
  "run.duration": "Planned duration",
  "run.start": "I’m going running",
  "run.saving": "Starting…",
  "run.point.choose": "Tap the map to choose your approximate training area.",
  "run.point.selected": "Area selected. You can start your training.",
  "run.privacy":
    "Approximate area, no live route. Runners declare their status; it expires automatically.",
  "run.storage":
    "Storage is unavailable. Reloading loses your controls, but your training will still expire automatically.",
  "run.started": "You’re on the map. You’re not alone.",
  "run.finished": "Well done. Training ended.",
  "run.share.text":
    "I’m heading out for a run. Someone, somewhere, is running too. You’re not training alone.",
  "run.link.copied": "Training invitation copied.",
  "run.error.active": "You already have an active training state.",
  "run.error.rate": "Take a moment — try again in {sec}s.",
  "run.error.missing": "This training has already ended.",
  "run.error.own": "This is your own training.",
  "run.error.already": "You have already encouraged this runner from this connection.",
  "run.error.save_failed": "Couldn't save the change. Please retry.",
  "run.error.nickname": "Choose a friendly nickname without links.",
  "share.title": "Your feeling can travel further",
  "share.description": "Your feeling is saved. Invite someone to add theirs.",
  "share.prompt": "How are you feeling today?",
  "share.statement.joy": "Today, I'm sharing a little joy.",
  "share.statement.calm": "Today, I'm sharing a little calm.",
  "share.statement.sadness": "Sadness has a place on my map, too.",
  "share.statement.anger": "Today, I'm sharing how anger feels.",
  "share.statement.anxiety": "Today, I'm making room for anxiety.",
  "share.statement.hope": "Today, I'm sharing a little hope.",
  "share.privacy": "Your location and note are not included in the card or link.",
  "share.action": "Share my feeling",
  "share.copy": "Copy link",
  "share.download": "Save image",
  "share.link": "Invitation link",
  "share.copied": "Link copied. Send it to someone you care about.",
  "share.copy.manual": "Select and copy the link above to share it.",
  "share.done": "Shared with your chosen app.",
  "share.image.error": "Image export is unavailable. You can still share the link.",
  "share.close": "Close sharing",
  "share.back": "Back to the map",
  "share.reopen": "Share my saved feeling",
  "invite.title": "An invitation to share a feeling",
  "invite.description":
    "Someone shared a feeling: {emotion}. How are you feeling today? Choose your own emotion, then tap the map.",
  "invite.action": "Choose my feeling",
  "invite.dismiss": "Dismiss invitation",
  "feed.loading": "Loading feelings…",
  "feed.snapshot": "{count} feelings loaded",
  "feed.empty": "No feelings in this time range yet. You can add the first one.",
  "feed.error": "Couldn't load feelings. This doesn't mean the map is empty.",
  "feed.error.cached": "Couldn't refresh feelings. Previously loaded points are still shown.",
  "feed.realtime.error": "Live updates are unavailable. New feelings may be missing.",
  "feed.connecting": "Connecting to live updates…",
  "feed.retry": "Try again",
  "live.feelings": "Live · {count} loaded feelings",
  "hero.title": "Feel the\u00a0world.",
  "hero.subtitle": "Anonymous. Pick an emotion, optionally leave a short note, then tap the map.",
  "mood.summary": "Most frequent: {emotions} ({count}/{total})",
  "mood.summary.tied": "Tied: {emotions} ({count}/{total} each)",
  "mood.sample":
    "This summary describes loaded feelings, not a representative survey. Older history may be incomplete.",
  "heatmap.description":
    "Warmer colors show more activity, weighted toward newer feelings. They do not represent emotion types.",
  "points.description":
    "Each point's color represents an emotion. Older points fade within the selected period.",
  "heatmap.description.all":
    "Warmer colors show more loaded feelings in an area, not emotion types.",
  "points.description.all": "Each point's color represents an emotion in the loaded history.",
  "range.label": "Time range",
  "range.description.live": "Last hour",
  "range.description.today": "Last 24 hours",
  "range.description.week": "Last 7 days",
  "range.description.all": "Available history",
  "toggle.heatmap": "Activity",
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
  "range.live": "1 h",
  "range.today": "24 h",
  "range.week": "7 days",
  "range.all": "History",
  "sound.on": "Sound on",
  "sound.off": "Sound off",
  "sound.loading": "Loading sound…",
  "sound.retry": "Retry sound",
  "sound.blocked": "Your browser requires a tap to play sound. Try again.",
  "sound.error": "Sound couldn't be played. You can try again.",
  "onboarding.hint": "Tap anywhere on the map to add your emotion.",
  "onboarding.tapToDismiss": "Tap to continue",
};

const sk: Dict = {
  "mode.feelings": "Pocity",
  "mode.running": "Práve bežíme",
  "run.title": "Netrénuješ sám.",
  "run.subtitle": "Niekde vo svete vyráža niekto tiež. Pridaj svoj beh a povzbuď ostatných.",
  "run.count": "Aktívne tréningy na mape: {count}",
  "run.loading": "Načítavam bežcov…",
  "run.unavailable": "Tréningy sa nedajú obnoviť",
  "run.empty": "Rozsvieť prvý bod na mape. Niekto ďalší sa môže pridať.",
  "run.anonymous": "Bežec",
  "run.feed.error": "Tréningy sa nepodarilo obnoviť. Načítané body môžu byť neaktuálne.",
  "run.refresh": "Stavy sa priebežne obnovujú.",
  "run.sample": "Zobrazujú sa najnovšie dostupné tréningy.",
  "run.map": "Mapa aktívnych bežcov",
  "run.map.error": "Mapu sa nepodarilo načítať.",
  "run.runner": "Detail bežca",
  "run.close": "Zavrieť detail bežca",
  "run.remaining": "Zostáva približne {min} min",
  "run.cheers": "povzbudení",
  "run.cheer": "👏 Držím palce!",
  "run.cheered": "Povzbudenie odoslané",
  "run.controls": "Tvoj tréning",
  "run.restoring": "Overujem tvoj tréning…",
  "run.owner.error": "Tvoj tréning sa nepodarilo overiť. Pred začatím to skús znova.",
  "run.you.running": "Tvoj tréning je aktívny",
  "run.owner.note": "Tréning môžeš ukončiť v tomto prehliadači.",
  "run.finish": "Mám hotovo",
  "run.share": "Pozvať niekoho",
  "run.after": "Dobehané. Ako sa cítiš?",
  "run.after.action": "Zdieľať pocit po behu",
  "run.nickname": "Prezývka (nepovinná, najviac 30 znakov)",
  "run.duration": "Plánované trvanie",
  "run.start": "Idem behať",
  "run.saving": "Spúšťam…",
  "run.point.choose": "Ťukni na mapu a označ približné miesto tréningu.",
  "run.point.selected": "Miesto je vybrané. Môžeš začať tréning.",
  "run.privacy": "Približné miesto, bez živej trasy. Stav zadáva bežec a automaticky vyprší.",
  "run.storage":
    "Úložisko nie je dostupné. Obnovením stránky stratíš ovládanie, ale tréning aj tak automaticky vyprší.",
  "run.started": "Si na mape. Netrénuješ sám.",
  "run.finished": "Dobrý výkon. Tréning je ukončený.",
  "run.share.text": "Vyrážam behať. Niekde vo svete vyráža niekto tiež. Netrénuješ sám.",
  "run.link.copied": "Pozvanie na tréning je skopírované.",
  "run.error.active": "Už máš aktívny tréning.",
  "run.error.rate": "Chvíľku počkaj — skús to znova o {sec}s.",
  "run.error.missing": "Tento tréning sa už skončil.",
  "run.error.own": "Toto je tvoj vlastný tréning.",
  "run.error.already": "Z tohto pripojenia už bežec dostal povzbudenie.",
  "run.error.save_failed": "Zmenu sa nepodarilo uložiť. Skús to znova.",
  "run.error.nickname": "Zvoľ slušnú prezývku bez odkazov.",
  "share.title": "Tvoj pocit môže ísť ďalej",
  "share.description": "Tvoj pocit je uložený. Pozvi niekoho, aby pridal svoj.",
  "share.prompt": "Ako sa dnes cítiš ty?",
  "share.statement.joy": "Dnes posielam svetu trochu radosti.",
  "share.statement.calm": "Dnes posielam svetu trochu pokoja.",
  "share.statement.sadness": "Aj smútok má na mojej mape miesto.",
  "share.statement.anger": "Dnes zdieľam aj svoj hnev.",
  "share.statement.anxiety": "Dnes dávam priestor aj úzkosti.",
  "share.statement.hope": "Dnes posielam svetu trochu nádeje.",
  "share.privacy": "Poloha a text tvojej poznámky sa do kartičky ani odkazu nepridávajú.",
  "share.action": "Zdieľať môj pocit",
  "share.copy": "Kopírovať odkaz",
  "share.download": "Uložiť obrázok",
  "share.link": "Odkaz na pozvanie",
  "share.copied": "Odkaz je skopírovaný. Pošli ho niekomu blízkemu.",
  "share.copy.manual": "Označ a skopíruj odkaz vyššie.",
  "share.done": "Odovzdané vybranej aplikácii.",
  "share.image.error": "Obrázok sa nepodarilo vytvoriť. Odkaz môžeš zdieľať aj tak.",
  "share.close": "Zavrieť zdieľanie",
  "share.back": "Späť na mapu",
  "share.reopen": "Zdieľať uložený pocit",
  "invite.title": "Pozvanie zdieľať pocit",
  "invite.description":
    "Niekto zdieľa pocit: {emotion}. Ako sa dnes cítiš ty? Vyber si vlastnú emóciu a klikni na mapu.",
  "invite.action": "Vybrať môj pocit",
  "invite.dismiss": "Skryť pozvanie",
  "feed.loading": "Načítavam pocity…",
  "feed.snapshot": "{count} načítaných pocitov",
  "feed.empty": "V tomto období zatiaľ nie sú žiadne pocity. Môžeš pridať prvý.",
  "feed.error": "Pocity sa nepodarilo načítať. Neznamená to, že je mapa prázdna.",
  "feed.error.cached": "Pocity sa nepodarilo obnoviť. Zobrazujú sa už načítané body.",
  "feed.realtime.error": "Živé aktualizácie sú nedostupné. Nové pocity môžu chýbať.",
  "feed.connecting": "Pripájam živé aktualizácie…",
  "feed.retry": "Skúsiť znova",
  "live.feelings": "Naživo · {count} načítaných pocitov",
  "hero.title": "Cíť\u00a0svet.",
  "hero.subtitle": "Anonymne. Vyber si emóciu, prípadne nechaj krátku poznámku, a klikni na mapu.",
  "mood.summary": "Najčastejšie: {emotions} ({count}/{total})",
  "mood.summary.tied": "Zhoda: {emotions} (každá {count}/{total})",
  "mood.sample":
    "Súhrn opisuje načítané pocity, nejde o reprezentatívny prieskum. Staršia história nemusí byť úplná.",
  "heatmap.description":
    "Teplejšie farby znamenajú viac aktivity s dôrazom na novšie pocity. Neoznačujú druh emócie.",
  "points.description":
    "Farba bodu označuje emóciu. Staršie body vo vybranom období postupne blednú.",
  "heatmap.description.all":
    "Teplejšie farby znamenajú viac načítaných pocitov v oblasti, nie druh emócie.",
  "points.description.all": "Farba bodu označuje emóciu v načítanej histórii.",
  "range.label": "Časové obdobie",
  "range.description.live": "Posledná hodina",
  "range.description.today": "Posledných 24 hodín",
  "range.description.week": "Posledných 7 dní",
  "range.description.all": "Dostupná história",
  "toggle.heatmap": "Aktivita",
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
  "range.live": "1 h",
  "range.today": "24 h",
  "range.week": "7 dní",
  "range.all": "História",
  "sound.on": "Zvuk zap.",
  "sound.off": "Zvuk vyp.",
  "sound.loading": "Načítavam zvuk…",
  "sound.retry": "Skúsiť zvuk znova",
  "sound.blocked": "Prehliadač vyžaduje kliknutie na spustenie zvuku. Skús znova.",
  "sound.error": "Zvuk sa nepodarilo prehrať. Môžeš to skúsiť znova.",
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

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = l;
    }
  }, []);

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
