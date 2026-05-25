import { useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { EMOTIONS, EMOTIONS_BY_KEY, type EmotionKey } from "@/lib/emotions";
import { submitEmotion } from "@/lib/emotions.functions";
import { moderateMessage, MAX_MESSAGE_LENGTH } from "@/lib/moderation";
import { toast } from "sonner";

interface EmotionRow {
  id: string;
  emotion: EmotionKey;
  lat: number;
  lng: number;
  message: string | null;
  created_at: string;
}

const MAX_MESSAGE = MAX_MESSAGE_LENGTH;

const MOOD_COPY: Record<EmotionKey, string> = {
  joy: "The world feels joyful today.",
  calm: "The world feels calm today.",
  sadness: "The world feels tender today.",
  anger: "The world feels restless today.",
  anxiety: "The world feels anxious today.",
  hope: "The world feels hopeful today.",
};

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

export function EmotionMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<any>(null);
  const submittingRef = useRef(false);
  const lastSubmitRef = useRef(0);
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
  const [heatmap, setHeatmap] = useState(false);

  // --- Global mood: most-shared emotion today ---
  const mood = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const counts: Record<EmotionKey, number> = {
      joy: 0, calm: 0, sadness: 0, anger: 0, anxiety: 0, hope: 0,
    };
    let total = 0;
    for (const r of rows) {
      if (new Date(r.created_at) >= start) {
        counts[r.emotion] = (counts[r.emotion] ?? 0) + 1;
        total++;
      }
    }
    if (total === 0) return null;
    let top: EmotionKey = "calm";
    let max = -1;
    for (const k of Object.keys(counts) as EmotionKey[]) {
      if (counts[k] > max) { max = counts[k]; top = k; }
    }
    return { key: top, count: max, total };
  }, [rows]);

  // --- Whispers: rotating anonymous messages ---
  const whispers = useMemo(
    () => rows.filter((r) => r.message && r.message.trim().length > 0).slice(0, 80),
    [rows],
  );
  const [whisperIdx, setWhisperIdx] = useState(0);
  const [whisperVisible, setWhisperVisible] = useState(true);
  useEffect(() => {
    if (whispers.length === 0) return;
    const interval = setInterval(() => {
      setWhisperVisible(false);
      setTimeout(() => {
        setWhisperIdx((i) => (i + 1 + Math.floor(Math.random() * Math.max(1, whispers.length - 1))) % whispers.length);
        setWhisperVisible(true);
      }, 600);
    }, 6500);
    return () => clearInterval(interval);
  }, [whispers.length]);
  const currentWhisper = whispers[whisperIdx % Math.max(1, whispers.length)];

  // --- init Leaflet on mount (client only) ---
  useEffect(() => {
    let cancelled = false;

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
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);

      // Click to drop an emotion
      map.on("click", async (e) => {
        if (submittingRef.current) return;
        const { lat, lng } = e.latlng;
        const emotion = selectedRef.current;
        const raw = messageRef.current;

        const sinceLast = Date.now() - lastSubmitRef.current;
        if (lastSubmitRef.current && sinceLast < 60_000) {
          toast.message("Take a breath", {
            description: `Try again in ${Math.ceil((60_000 - sinceLast) / 1000)}s.`,
          });
          return;
        }

        const check = moderateMessage(raw);
        if (!check.ok) {
          toast.message("A gentle nudge", { description: check.reason });
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
            toast.message("A gentle nudge", { description: result.reason });
            return;
          }
          lastSubmitRef.current = Date.now();
          toast.success(
            `${EMOTIONS_BY_KEY[emotion].emoji} ${EMOTIONS_BY_KEY[emotion].label} dropped`,
          );
          setMessage("");
        } catch (err) {
          console.error(err);
          toast.error("Couldn't drop your feeling. Try again.");
        } finally {
          submittingRef.current = false;
        }
      });

      // Initial load
      const { data } = await supabase
        .from("emotions")
        .select("id, emotion, lat, lng, message, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (data) {
        const initial = data as EmotionRow[];
        setRows(initial);
        for (const row of initial) addMarker(row, false);
      }

      // Realtime
      const channel = supabase
        .channel("emotions-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "emotions" },
          (payload) => {
            const row = payload.new as EmotionRow;
            addMarker(row, true);
            setRows((prev) => [row, ...prev].slice(0, 1000));
          },
        )
        .subscribe();

      (map as unknown as { __channel: typeof channel }).__channel = channel;
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map) {
        const channel = (map as unknown as { __channel?: ReturnType<typeof supabase.channel> })
          .__channel;
        if (channel) supabase.removeChannel(channel);
        map.remove();
      }
      mapRef.current = null;
      markersRef.current.clear();
      markersLayerRef.current = null;
      heatLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Heatmap toggle ---
  useEffect(() => {
    const L = leafletRef.current as any;
    const map = mapRef.current;
    if (!L || !map) return;

    if (heatmap) {
      if (markersLayerRef.current && map.hasLayer(markersLayerRef.current)) {
        map.removeLayer(markersLayerRef.current);
      }
      const points = rows.map((r) => [r.lat, r.lng, 0.6] as [number, number, number]);
      if (heatLayerRef.current) {
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
  }, [heatmap, rows]);

  function addMarker(row: EmotionRow, isNew: boolean) {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!L || !map || !layer) return;
    if (markersRef.current.has(row.id)) return;

    const meta = EMOTIONS_BY_KEY[row.emotion];
    if (!meta) return;

    const icon = L.divIcon({
      className: "",
      html: `<div class="emotion-dot ${isNew ? "just-added" : ""}" style="background: var(${meta.cssVar}); color: var(${meta.cssVar});" title="${meta.label}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([row.lat, row.lng], { icon, keyboard: false }).addTo(layer);

    const hasMessage = row.message && row.message.trim().length > 0;
    if (hasMessage) {
      const safe = escapeHtml(row.message!.trim());
      marker.bindPopup(
        `<div class="emotion-popup"><div class="emotion-popup-head"><span class="text-base">${meta.emoji}</span><span class="emotion-popup-label">${meta.label}</span></div><p class="emotion-popup-body">${safe}</p></div>`,
        { closeButton: true, className: "emotion-popup-wrapper" },
      );
    }
    marker.bindTooltip(
      hasMessage ? `${meta.emoji} ${meta.label} · tap to read` : `${meta.emoji} ${meta.label}`,
      {
        direction: "top",
        offset: [0, -8],
        opacity: 0.95,
        className: "emotion-tooltip",
      },
    );
    markersRef.current.set(row.id, marker);
  }

  const remaining = MAX_MESSAGE - message.length;
  const moodMeta = mood ? EMOTIONS_BY_KEY[mood.key] : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Header overlay */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex flex-col items-start gap-1 p-5 sm:p-7">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md">
          <span className="size-1.5 rounded-full bg-emotion-hope" />
          Live · {rows.length} feelings dropped
        </div>
        <h1 className="mt-2 max-w-xl text-3xl font-semibold leading-[1.05] sm:text-5xl">
          Feel the&nbsp;world.
        </h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          Anonymous. Pick an emotion, optionally leave a short note, then tap the map.
        </p>

        {/* Global Mood */}
        {moodMeta && (
          <div
            key={moodMeta.key}
            className="pointer-events-auto mt-3 inline-flex animate-fade-in items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs text-foreground/90 backdrop-blur-md sm:text-sm"
            style={{
              boxShadow: `0 8px 30px -12px color-mix(in oklab, var(${moodMeta.cssVar}) 55%, transparent)`,
            }}
          >
            <span
              className="size-2 rounded-full"
              style={{
                background: `var(${moodMeta.cssVar})`,
                boxShadow: `0 0 12px var(${moodMeta.cssVar})`,
              }}
            />
            <span>{MOOD_COPY[moodMeta.key]}</span>
            <span className="text-muted-foreground">· today</span>
          </div>
        )}
      </header>

      {/* Heatmap toggle */}
      <div className="pointer-events-auto absolute right-4 top-5 z-[400] sm:right-7 sm:top-7">
        <button
          type="button"
          onClick={() => setHeatmap((v) => !v)}
          aria-pressed={heatmap}
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
          {heatmap ? "Heatmap" : "Points"}
        </button>
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
              <span className="opacity-50">· whisper</span>
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
            placeholder="Say something (optional, anonymous)…"
            maxLength={MAX_MESSAGE}
            aria-label="Optional anonymous message"
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

        <div className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-border bg-surface/80 p-1.5 shadow-2xl backdrop-blur-xl">
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
                <span className="hidden sm:inline">{e.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
