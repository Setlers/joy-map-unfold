import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import ambientAsset from "@/assets/cosmic-glow.mp3.asset.json";

const STORAGE_KEY = "ambient-sound";
const VOLUME = 0.12;

export function AmbientSound() {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);

  // Hydrate preference on client
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "on") setOn(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = VOLUME;
    if (on) {
      audio.play().catch(() => {
        // Autoplay blocked — flip off until next user interaction
        setOn(false);
      });
    } else {
      audio.pause();
    }
  }, [on]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <audio ref={audioRef} src={ambientAsset.url} loop preload="none" playsInline />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? t("sound.on") : t("sound.off")}
        title={on ? t("sound.on") : t("sound.off")}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-foreground/85 backdrop-blur-md transition-colors hover:bg-accent"
      >
        <span
          className="size-1.5 rounded-full transition-all"
          style={{
            background: on ? "var(--emotion-hope)" : "var(--emotion-calm)",
            boxShadow: on
              ? "0 0 10px var(--emotion-hope)"
              : "0 0 6px var(--emotion-calm)",
            opacity: on ? 1 : 0.55,
          }}
        />
        {on ? t("sound.on") : t("sound.off")}
      </button>
    </>
  );
}
