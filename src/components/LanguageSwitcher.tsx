import { useI18n, type Lang } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  const opts: Lang[] = ["sk", "en"];

  return (
    <div
      role="group"
      aria-label="Language"
      className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-border bg-surface/70 px-1 py-1 text-[11px] uppercase tracking-[0.18em] text-foreground/85 backdrop-blur-md"
    >
      {opts.map((l, i) => {
        const active = lang === l;
        return (
          <div key={l} className="flex items-center">
            {i > 0 && <span className="px-0.5 text-muted-foreground/60">|</span>}
            <button
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={active}
              className={[
                "rounded-full px-2 py-1 transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {l.toUpperCase()}
            </button>
          </div>
        );
      })}
    </div>
  );
}
