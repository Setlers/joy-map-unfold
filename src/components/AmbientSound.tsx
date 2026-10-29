import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { createAmbientAudioController, type AmbientAudioState } from "@/lib/ambient-audio";
import ambientAsset from "@/assets/cosmic-glow.mp3.asset.json";

const STORAGE_KEY = "ambient-sound";
const AUDIO_URL = import.meta.env.VITE_AMBIENT_AUDIO_URL?.trim() || ambientAsset.url;

export function AmbientSound() {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createAmbientAudioController> | null>(null);
  const [state, setState] = useState<AmbientAudioState>("off");
  const descriptionId = useId();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const controller = createAmbientAudioController(audio, setState, (on) => {
      try {
        localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
      } catch {
        /* Playback works even when storage is unavailable. */
      }
    });
    controllerRef.current = controller;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "on") controller.start();
    } catch {
      /* Storage is optional. */
    }
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  const on = state === "playing";
  const problem = state === "error" || state === "blocked";
  const label = t(
    state === "loading" ? "sound.loading" : problem ? "sound.retry" : on ? "sound.on" : "sound.off",
  );
  return (
    <span className="inline-flex max-w-48 flex-col items-start gap-1">
      <audio ref={audioRef} src={AUDIO_URL} loop preload="none" playsInline />
      <button
        type="button"
        onClick={() => controllerRef.current?.toggle()}
        aria-pressed={on}
        aria-busy={state === "loading"}
        aria-describedby={problem ? descriptionId : undefined}
        aria-label={label}
        title={label}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-foreground/85 backdrop-blur-md transition-colors hover:bg-accent"
      >
        <span
          className="size-1.5 rounded-full transition-all"
          style={{
            background: on ? "var(--emotion-hope)" : "var(--emotion-calm)",
            boxShadow: on ? "0 0 10px var(--emotion-hope)" : "0 0 6px var(--emotion-calm)",
            opacity: on ? 1 : 0.55,
          }}
        />
        {label}
      </button>
      {problem && (
        <span id={descriptionId} role="status" className="text-xs text-muted-foreground">
          {t(state === "blocked" ? "sound.blocked" : "sound.error")}
        </span>
      )}
    </span>
  );
}
