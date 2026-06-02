import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

const STORAGE_KEY = "onboarding.dismissed";

export function OnboardingHint() {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (!dismissed) {
        setMounted(true);
        // next frame for fade-in
        requestAnimationFrame(() => setVisible(true));
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (!mounted) return null;

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setTimeout(() => setMounted(false), 600);
  };

  return (
    <div
      onClick={dismiss}
      onTouchStart={dismiss}
      role="button"
      aria-label="Dismiss onboarding"
      className={`fixed inset-0 z-[600] flex items-center justify-center bg-background/55 backdrop-blur-[2px] transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`pointer-events-none mx-6 max-w-sm rounded-2xl border border-border bg-surface/80 px-6 py-5 text-center shadow-2xl backdrop-blur-xl transition-all duration-500 ${
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <div className="mb-2 flex justify-center gap-1.5 text-xl">
          <span>💛</span>
          <span>💙</span>
          <span>💚</span>
        </div>
        <p className="text-base leading-snug text-foreground/95 sm:text-lg">
          {t("onboarding.hint")}
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {t("onboarding.tapToDismiss")}
        </p>
      </div>
    </div>
  );
}
