export type AmbientAudioState = "off" | "loading" | "playing" | "blocked" | "error";
type Audio = Pick<
  HTMLAudioElement,
  "play" | "pause" | "paused" | "volume" | "addEventListener" | "removeEventListener"
>;

export function createAmbientAudioController(
  audio: Audio,
  notify: (state: AmbientAudioState) => void,
  persist: (on: boolean) => void,
  timeoutMs = 15_000,
) {
  let wanted = false;
  let disposed = false;
  let attempt = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
  };
  const fail = (state: "error" | "blocked") => {
    if (!wanted || disposed) return;
    wanted = false;
    attempt++;
    clearTimer();
    audio.pause();
    persist(false);
    notify(state);
  };
  const buffering = () => {
    if (!wanted || disposed) return;
    clearTimer();
    notify("loading");
    timeout = setTimeout(() => fail("error"), timeoutMs);
  };
  const playing = () => {
    if (disposed) return;
    if (!wanted) {
      audio.pause();
      return;
    }
    clearTimer();
    persist(true);
    notify("playing");
  };
  const paused = () => {
    // A queued pause event from an older attempt can arrive after a new play.
    if (!wanted || disposed || !audio.paused) return;
    wanted = false;
    attempt++;
    clearTimer();
    persist(false);
    notify("off");
  };
  const error = () => fail("error");
  const listeners = {
    playing,
    waiting: buffering,
    stalled: buffering,
    pause: paused,
    ended: paused,
    error,
  };
  for (const [event, listener] of Object.entries(listeners))
    audio.addEventListener(event, listener);

  const start = () => {
    if (disposed || wanted) return;
    wanted = true;
    const current = ++attempt;
    audio.volume = 0.12;
    buffering();
    const rejected = (reason: unknown) => {
      if (disposed || current !== attempt || !wanted) return;
      fail(reason instanceof Error && reason.name === "NotAllowedError" ? "blocked" : "error");
    };
    // Preserve browser user activation by calling play directly from the click.
    try {
      void audio.play().catch(rejected);
    } catch (reason) {
      rejected(reason);
    }
  };
  const stop = () => {
    if (disposed) return;
    wanted = false;
    attempt++;
    clearTimer();
    audio.pause();
    persist(false);
    notify("off");
  };
  return {
    start,
    stop,
    toggle: () => (wanted ? stop() : start()),
    destroy: () => {
      if (disposed) return;
      disposed = true;
      wanted = false;
      attempt++;
      clearTimer();
      for (const [event, listener] of Object.entries(listeners))
        audio.removeEventListener(event, listener);
      audio.pause();
    },
  };
}
