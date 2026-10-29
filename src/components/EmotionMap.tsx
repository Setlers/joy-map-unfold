import { useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { EMOTIONS, EMOTIONS_BY_KEY, type EmotionKey } from "@/lib/emotions";
import { submitEmotion } from "@/lib/emotions.functions";
import { moderateMessage, MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AmbientSound } from "@/components/AmbientSound";
import { OnboardingHint } from "@/components/OnboardingHint";
import { toast } from "sonner";
import { readEmotionFeed, type EmotionRow } from "@/lib/emotion-feed";
import { summarizeEmotions } from "@/lib/emotion-summary";
import { ShareFeelingDialog } from "@/components/ShareFeelingDialog";
import { reportFeelingShare, type ShareLanguage } from "@/lib/feeling-share";

function rowKey(r: EmotionRow) {
  return `${r.created_at}|${r.emotion}|${r.lat}|${r.lng}|${r.message ?? ""}`;
}

const MAX_MESSAGE = MAX_MESSAGE_LENGTH;
const MIN_OPACITY = 0.2;

type RangeKey = "live" | "today" | "week" | "all";

const RANGES: { key: RangeKey; ms: number }[] = [
  { key: "live", ms: 60 * 60 * 1000 },
  { key: "today", ms: 24 * 60 * 60 * 1000 },
  { key: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "all", ms: Number.POSITIVE_INFINITY },
];

const RANGE_BY_KEY: Record<RangeKey, number> = Object.fromEntries(
  RANGES.map((r) => [r.key, r.ms]),
) as Record<RangeKey, number>;

const RANGE_STORAGE = "range";

function ageOpacity(createdAt: string, now: number, windowMs: number) {
  if (!isFinite(windowMs)) return 1;
  const age = now - new Date(createdAt).getTime();
  if (age <= 0) return 1;
  if (age >= windowMs) return 0;
  return MIN_OPACITY + (1 - MIN_OPACITY) * (1 - age / windowMs);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function approxRegion(lat: number, lng: number) {
  const ns = lat >= 23 ? "Northern" : lat <= -23 ? "Southern" : "Equatorial";
  let band = "Atlantic";
  if (lng >= -30 && lng < 60) band = "Europe / Africa";
  else if (lng >= 60 && lng < 150) band = "Asia";
  else if (lng >= 150 || lng < -150) band = "Pacific";
  else band = "Americas";
  return `${ns} ${band}`;
}

export function EmotionMap({
  invitationEmotion,
  invitationLanguage,
}: {
  invitationEmotion?: EmotionKey;
  invitationLanguage?: ShareLanguage;
}) {
  const { t, lang, setLang } = useI18n();
  const [sharedEmotion, setSharedEmotion] = useState<EmotionKey | null>(null);
  const [lastSavedEmotion, setLastSavedEmotion] = useState<EmotionKey | null>(null);
  const [invitationDismissed, setInvitationDismissed] = useState(false);
  const invitationLoggedRef = useRef<EmotionKey | null>(null);
  const invitationEmotionRef = useRef(invitationEmotion);
  const emotionPickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    invitationEmotionRef.current = invitationEmotion;
    if (invitationEmotion && invitationLanguage) setLang(invitationLanguage);
  }, [invitationEmotion, invitationLanguage, setLang]);
  useEffect(() => {
    if (invitationEmotion && invitationLoggedRef.current !== invitationEmotion) {
      invitationLoggedRef.current = invitationEmotion;
      reportFeelingShare("invite_opened", invitationEmotion);
    }
    setInvitationDismissed(false);
  }, [invitationEmotion]);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.HeatLayer | null>(null);
  const submittingRef = useRef(false);
  const lastSubmitRef = useRef(0);
  const newKeysRef = useRef<Set<string>>(new Set());
  const submit = useServerFn(submitEmotion);

  const [selected, setSelected] = useState<EmotionKey>("joy");
  const selectedRef = useRef<EmotionKey>(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const [message, setMessage] = useState("");
  const messageRef = useRef("");
  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  const [rows, setRows] = useState<EmotionRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [realtimeState, setRealtimeState] = useState<"connecting" | "live" | "error">("connecting");
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const retryFeed = () => {
    setReloadAttempt((attempt) => attempt + 1);
    setConnectionAttempt((attempt) => attempt + 1);
  };
  const [heatmap, setHeatmap] = useState(false);
  const [range, setRangeState] = useState<RangeKey>("today");
  const windowMs = RANGE_BY_KEY[range];
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Error messages and translations change the header height. Keep Leaflet's
  // zoom buttons below the actual controls instead of a fixed pixel offset.
  useEffect(() => {
    const header = headerRef.current;
    const container = containerRef.current;
    if (!header || !container) return;
    const update = () =>
      container.style.setProperty(
        "--map-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Hydrate range from storage on client (avoid SSR mismatch).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RANGE_STORAGE) as RangeKey | null;
      if (stored && stored in RANGE_BY_KEY) setRangeState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const setRange = (r: RangeKey) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_STORAGE, r);
    } catch {
      /* ignore */
    }
  };

  // Tick every 60s to re-evaluate freshness, fade markers, prune stale ones
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Filter to selected window
  const freshRows = useMemo(() => {
    if (!isFinite(windowMs)) return rows;
    return rows.filter((r) => nowTs - new Date(r.created_at).getTime() < windowMs);
  }, [rows, nowTs, windowMs]);

  // Describe only the loaded sample in the selected time window.
  const mood = useMemo(() => summarizeEmotions(freshRows), [freshRows]);

  // Whispers within window
  const whispers = useMemo(
    () => freshRows.filter((r) => r.message && r.message.trim().length > 0).slice(0, 80),
    [freshRows],
  );
  const [whisperIdx, setWhisperIdx] = useState(0);
  const [whisperVisible, setWhisperVisible] = useState(true);
  useEffect(() => {
    if (whispers.length === 0) return;
    const interval = setInterval(() => {
      setWhisperVisible(false);
      setTimeout(() => {
        setWhisperIdx(
          (i) =>
            (i + 1 + Math.floor(Math.random() * Math.max(1, whispers.length - 1))) %
            whispers.length,
        );
        setWhisperVisible(true);
      }, 600);
    }, 6500);
    return () => clearInterval(interval);
  }, [whispers.length]);
  const currentWhisper = whispers[whisperIdx % Math.max(1, whispers.length)];

  // --- init Leaflet on mount (client only) ---
  useEffect(() => {
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.heat");
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center: [22, 10],
        zoom: 3,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: true,
        zoomControl: false,
        attributionControl: true,
      });
      mapRef.current = map;
      L.control.zoom({ position: "topright" }).addTo(map);

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { attribution: "&copy; Esri, HERE, Garmin, OSM", maxNativeZoom: 16, maxZoom: 18 },
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 16, maxZoom: 18 },
      ).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);

      // Click to drop an emotion
      map.on("click", async (e) => {
        if (submittingRef.current) return;
        const tt = tRef.current;
        const { lat, lng } = e.latlng;
        const emotion = selectedRef.current;
        const raw = messageRef.current;

        const sinceLast = Date.now() - lastSubmitRef.current;
        if (lastSubmitRef.current && sinceLast < 60_000) {
          toast.message(tt("toast.breath.title"), {
            description: tt("toast.breath.desc", {
              sec: Math.ceil((60_000 - sinceLast) / 1000),
            }),
          });
          return;
        }

        const check = moderateMessage(raw);
        if (!check.ok) {
          toast.message(tt("toast.nudge.title"), {
            description: tt(`mod.${check.code}`, check.params ?? {}),
          });
          return;
        }

        submittingRef.current = true;
        try {
          const result = await submit({
            data: {
              emotion,
              lat,
              lng,
              message: check.clean.length > 0 ? check.clean : null,
            },
          });
          if (!result.ok) {
            toast.message(tt("toast.nudge.title"), {
              description: tt(`mod.${result.code}`, result.params ?? {}),
            });
            return;
          }
          lastSubmitRef.current = Date.now();
          const meta = EMOTIONS_BY_KEY[emotion];
          toast.success(
            tt("toast.dropped", { emoji: meta.emoji, label: tt(`emotion.${emotion}`) }),
          );
          setMessage("");
          setLastSavedEmotion(emotion);
          setSharedEmotion(emotion);
          setInvitationDismissed(true);
          if (invitationEmotionRef.current) reportFeelingShare("invite_submitted", emotion);
        } catch (err) {
          console.error(err);
          toast.error(tt("toast.error"));
        } finally {
          submittingRef.current = false;
        }
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
      markersLayerRef.current = null;
      heatLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track connection health independently of map initialization. A successful
  // reconnect fetches the snapshot again to recover events missed while offline.
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    setRealtimeState("connecting");
    try {
      channel = supabase
        .channel("emotions-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "emotions" },
          (payload) => {
            if (cancelled) return;
            const raw = payload.new as Record<string, unknown>;
            const row: EmotionRow = {
              emotion: raw.emotion as EmotionKey,
              lat: raw.lat as number,
              lng: raw.lng as number,
              message: (raw.message as string | null) ?? null,
              created_at: raw.created_at as string,
            };
            newKeysRef.current.add(rowKey(row));
            setRows((prev) => {
              const k = rowKey(row);
              if (prev.some((p) => rowKey(p) === k)) return prev;
              return [row, ...prev].slice(0, 5000);
            });
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setRealtimeState("live");
            setReloadAttempt((attempt) => attempt + 1);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeState("error");
          }
        });
    } catch {
      setRealtimeState("error");
    }

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [connectionAttempt]);

  // --- Re-fetch from DB when range changes ---
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoadState("loading");
    (async () => {
      try {
        const data = await readEmotionFeed(supabase, windowMs, controller.signal);
        if (cancelled) return;
        setRows((prev) => {
          const seen = new Set(prev.map(rowKey));
          const merged = [...prev];
          for (const r of data as EmotionRow[]) {
            const k = rowKey(r);
            if (!seen.has(k)) {
              seen.add(k);
              merged.push(r);
            }
          }
          merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return merged.slice(0, 5000);
        });
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [range, windowMs, reloadAttempt]);

  // --- Sync markers to freshRows + update opacity / labels ---
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    const want = new Set(freshRows.map(rowKey));

    // Remove markers outside the window
    const toRemove: string[] = [];
    markersRef.current.forEach((marker, key) => {
      if (!want.has(key)) {
        layer.removeLayer(marker);
        toRemove.push(key);
      }
    });
    for (const k of toRemove) markersRef.current.delete(k);

    // Add or refresh markers in window
    for (const row of freshRows) {
      const k = rowKey(row);
      const existing = markersRef.current.get(k);
      if (!existing) {
        const isNew = newKeysRef.current.delete(k);
        addMarker(row, isNew);
      } else {
        existing.setOpacity(ageOpacity(row.created_at, nowTs, windowMs));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshRows, nowTs, windowMs, lang, mapReady]);

  // --- Heatmap toggle (windowed, weighted by freshness) ---
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (heatmap) {
      if (markersLayerRef.current && map.hasLayer(markersLayerRef.current)) {
        map.removeLayer(markersLayerRef.current);
      }
      const points = freshRows.map(
        (r) =>
          [r.lat, r.lng, isFinite(windowMs) ? ageOpacity(r.created_at, nowTs, windowMs) : 0.6] as [
            number,
            number,
            number,
          ],
      );
      if (heatLayerRef.current) {
        if (!map.hasLayer(heatLayerRef.current)) {
          heatLayerRef.current.addTo(map);
        }
        heatLayerRef.current.setLatLngs(points);
      } else {
        heatLayerRef.current = L.heatLayer(points, {
          radius: 28,
          blur: 35,
          maxZoom: 6,
          minOpacity: 0.25,
          gradient: {
            0.2: "#5b6cff",
            0.4: "#22d3a8",
            0.6: "#f4c64f",
            0.8: "#f08a3a",
            1.0: "#ef4d4d",
          },
        }).addTo(map);
      }
    } else {
      if (heatLayerRef.current && map.hasLayer(heatLayerRef.current)) {
        map.removeLayer(heatLayerRef.current);
      }
      if (markersLayerRef.current && !map.hasLayer(markersLayerRef.current)) {
        map.addLayer(markersLayerRef.current);
      }
    }
  }, [heatmap, freshRows, nowTs, windowMs, mapReady]);

  function addMarker(row: EmotionRow, isNew: boolean) {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!L || !map || !layer) return;
    const key = rowKey(row);
    if (markersRef.current.has(key)) return;

    const meta = EMOTIONS_BY_KEY[row.emotion];
    if (!meta) return;
    const tt = tRef.current;
    const label = tt(`emotion.${row.emotion}`);

    const icon = L.divIcon({
      className: "",
      html: `<div class="emotion-dot ${isNew ? "just-added" : ""}" style="background: var(${meta.cssVar}); color: var(${meta.cssVar});" title="${label}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([row.lat, row.lng], { icon, keyboard: false }).addTo(layer);
    (marker as unknown as { __row: EmotionRow }).__row = row;
    const op = ageOpacity(row.created_at, Date.now(), windowMs);
    if (op <= 0) return;
    marker.setOpacity(op);

    const hasMessage = row.message && row.message.trim().length > 0;
    if (hasMessage) {
      const safe = escapeHtml(row.message!.trim());
      marker.bindPopup(
        `<div class="emotion-popup"><div class="emotion-popup-head"><span class="text-base">${meta.emoji}</span><span class="emotion-popup-label">${label}</span></div><p class="emotion-popup-body">${safe}</p></div>`,
        { closeButton: true, className: "emotion-popup-wrapper" },
      );
    }
    marker.bindTooltip(
      hasMessage
        ? tt("tooltip.read", { emoji: meta.emoji, label })
        : tt("tooltip.simple", { emoji: meta.emoji, label }),
      {
        direction: "top",
        offset: [0, -8],
        opacity: 0.95,
        className: "emotion-tooltip",
      },
    );
    markersRef.current.set(key, marker);
  }

  const remaining = MAX_MESSAGE - message.length;
  const moodMeta = mood?.keys.length === 1 ? EMOTIONS_BY_KEY[mood.keys[0]] : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top area: header + controls */}
      <div
        ref={headerRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex flex-col gap-3 p-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:p-7"
      >
        {/* Left: title, subtitle, mood */}
        <header className="flex min-w-0 flex-col items-start gap-1">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md">
            <span
              className={`size-1.5 rounded-full ${loadState === "ready" && realtimeState === "live" ? "bg-emotion-hope" : "bg-muted-foreground"}`}
            />
            {loadState === "loading"
              ? t("feed.loading")
              : t(
                  loadState === "ready" && realtimeState === "live"
                    ? "live.feelings"
                    : "feed.snapshot",
                  { count: freshRows.length },
                )}
          </div>
          <h1 className="mt-2 max-w-full text-3xl font-semibold leading-[1.05] sm:max-w-xl sm:text-5xl">
            {t("hero.title")}
          </h1>
          <p className="max-w-full text-sm text-muted-foreground sm:max-w-md sm:text-base">
            {t("hero.subtitle")}
          </p>

          {invitationEmotion && !invitationDismissed && (
            <section
              aria-label={t("invite.title")}
              className="pointer-events-auto mt-3 max-w-md rounded-2xl border border-border bg-surface/90 p-4 shadow-xl backdrop-blur-md"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  {EMOTIONS_BY_KEY[invitationEmotion].emoji} {t("invite.title")}
                </p>
                <button
                  type="button"
                  aria-label={t("invite.dismiss")}
                  onClick={() => setInvitationDismissed(true)}
                  className="rounded-full px-2 text-muted-foreground"
                >
                  ×
                </button>
              </div>
              <p className="mt-2 text-sm">
                {t("invite.description", { emotion: t(`emotion.${invitationEmotion}`) })}
              </p>
              <button
                type="button"
                className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
                onClick={() => {
                  setInvitationDismissed(true);
                  reportFeelingShare("invite_accepted", invitationEmotion);
                  emotionPickerRef.current
                    ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
                    ?.focus();
                }}
              >
                {t("invite.action")}
              </button>
            </section>
          )}
          {lastSavedEmotion && (
            <button
              type="button"
              onClick={() => setSharedEmotion(lastSavedEmotion)}
              className="pointer-events-auto mt-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs"
            >
              {t("share.reopen")}
            </button>
          )}

          <div
            className="pointer-events-auto max-w-md text-sm"
            aria-live="polite"
            aria-atomic="true"
          >
            {loadState === "error" && (
              <p role="alert" className="mt-2 rounded-xl border border-border bg-surface/90 p-3">
                {t(freshRows.length ? "feed.error.cached" : "feed.error")}
              </p>
            )}
            {loadState === "ready" && freshRows.length === 0 && (
              <p className="mt-2 rounded-xl border border-border bg-surface/90 p-3">
                {t("feed.empty")}
              </p>
            )}
            {realtimeState === "error" && (
              <p className="mt-2 rounded-xl border border-border bg-surface/90 p-3">
                {t("feed.realtime.error")}
              </p>
            )}
            {realtimeState === "connecting" && loadState === "ready" && (
              <p className="mt-2 text-muted-foreground">{t("feed.connecting")}</p>
            )}
            {(loadState === "error" || realtimeState === "error") && (
              <button
                type="button"
                onClick={retryFeed}
                disabled={loadState === "loading"}
                className="mt-2 rounded-full border border-border bg-surface/90 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {t("feed.retry")}
              </button>
            )}
          </div>

          {/* Most frequent emotions in the loaded sample */}
          {mood && loadState === "ready" && (
            <div
              key={`${mood.keys.join("-")}-${lang}-${range}`}
              className="pointer-events-auto mt-3 inline-flex max-w-full animate-fade-in flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur-md sm:text-sm"
              style={{
                boxShadow: `0 8px 30px -12px color-mix(in oklab, var(${moodMeta?.cssVar ?? "--muted-foreground"}) 55%, transparent)`,
              }}
            >
              <span
                className="size-2 rounded-full"
                style={{
                  background: `var(${moodMeta?.cssVar ?? "--muted-foreground"})`,
                  boxShadow: `0 0 12px var(${moodMeta?.cssVar ?? "--muted-foreground"})`,
                }}
              />
              <span>
                {t(mood.keys.length === 1 ? "mood.summary" : "mood.summary.tied", {
                  emotions: mood.keys.map((key) => t(`emotion.${key}`)).join(" / "),
                  count: mood.count,
                  total: mood.total,
                })}
              </span>
              <span className="text-muted-foreground">· {t(`range.description.${range}`)}</span>
            </div>
          )}
          <p className="mt-2 max-w-md text-xs text-muted-foreground">{t("mood.sample")}</p>
        </header>

        {/* Right: language + range + toggle */}
        <div className="pointer-events-auto flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-start gap-2">
            <LanguageSwitcher />
            <AmbientSound />
            <button
              type="button"
              onClick={() => setHeatmap((v) => !v)}
              aria-pressed={heatmap}
              aria-describedby="heatmap-description"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-foreground/85 backdrop-blur-md transition-colors hover:bg-accent"
            >
              <span
                className="size-1.5 rounded-full"
                style={{
                  background: heatmap ? "var(--emotion-anxiety)" : "var(--emotion-calm)",
                  boxShadow: heatmap
                    ? "0 0 10px var(--emotion-anxiety)"
                    : "0 0 10px var(--emotion-calm)",
                }}
              />
              {heatmap ? t("toggle.heatmap") : t("toggle.points")}
            </button>
          </div>

          <p id="heatmap-description" className="max-w-xs text-xs text-muted-foreground">
            {t(`${heatmap ? "heatmap" : "points"}.description${range === "all" ? ".all" : ""}`)}
          </p>

          {/* Time range filter */}
          <div
            role="tablist"
            aria-label={t("range.label")}
            className="inline-flex flex-wrap items-center gap-0.5 rounded-full border border-border bg-surface/70 p-1 text-[11px] uppercase tracking-[0.14em] text-foreground/80 backdrop-blur-md sm:flex-nowrap sm:text-xs"
          >
            {RANGES.map((r) => {
              const active = range === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={t(`range.description.${r.key}`)}
                  onClick={() => setRange(r.key)}
                  className={[
                    "relative rounded-full px-2.5 py-1 transition-all duration-300 sm:px-3",
                    active
                      ? "bg-foreground/90 text-background shadow-[0_4px_18px_-6px_rgba(0,0,0,0.5)]"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {t(`range.${r.key}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Emotional Whispers */}
      {currentWhisper && (
        <div className="pointer-events-none absolute bottom-32 right-4 z-[400] max-w-[min(320px,calc(100vw-2rem))] sm:bottom-28 sm:right-7">
          <div
            className={`whisper-card pointer-events-auto rounded-2xl border border-border bg-surface/75 p-3.5 shadow-2xl backdrop-blur-xl transition-all duration-700 ${
              whisperVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span className="text-base leading-none">
                {EMOTIONS_BY_KEY[currentWhisper.emotion].emoji}
              </span>
              <span>{approxRegion(currentWhisper.lat, currentWhisper.lng)}</span>
              <span className="opacity-50">{t("whisper.label")}</span>
            </div>
            <p className="text-sm leading-snug text-foreground/95">
              &ldquo;{currentWhisper.message}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Composer + Emotion picker */}
      <div className="absolute inset-x-0 bottom-0 z-[400] flex flex-col items-center gap-2 p-4 sm:p-6">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-2xl border border-border bg-surface/80 px-3 py-2 shadow-2xl backdrop-blur-xl">
          <span className="text-lg leading-none">{EMOTIONS_BY_KEY[selected].emoji}</span>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
            placeholder={t("composer.placeholder")}
            maxLength={MAX_MESSAGE}
            aria-label={t("composer.aria")}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <span
            className={`tabular-nums text-[10px] ${
              remaining <= 20 ? "text-emotion-anger" : "text-muted-foreground"
            }`}
          >
            {remaining}
          </span>
        </div>

        <div
          ref={emotionPickerRef}
          className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-border bg-surface/80 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          {EMOTIONS.map((e) => {
            const active = e.key === selected;
            return (
              <button
                key={e.key}
                type="button"
                onClick={() => setSelected(e.key)}
                aria-pressed={active}
                className={[
                  "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all sm:px-4",
                  active
                    ? "scale-[1.02] text-background shadow-lg"
                    : "text-foreground/85 hover:bg-accent",
                ].join(" ")}
                style={
                  active
                    ? {
                        backgroundColor: `var(${e.cssVar})`,
                        boxShadow: `0 8px 30px -8px color-mix(in oklab, var(${e.cssVar}) 70%, transparent)`,
                      }
                    : undefined
                }
              >
                <span className="text-lg leading-none">{e.emoji}</span>
                <span className="hidden sm:inline">{t(`emotion.${e.key}`)}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!invitationEmotion && <OnboardingHint />}
      {sharedEmotion && (
        <ShareFeelingDialog emotion={sharedEmotion} onClose={() => setSharedEmotion(null)} />
      )}
    </div>
  );
}
