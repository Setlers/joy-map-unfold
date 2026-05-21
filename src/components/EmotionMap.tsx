import { useEffect, useRef, useState } from "react";
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function EmotionMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

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

  const [count, setCount] = useState(0);

  // --- init Leaflet on mount (client only) ---
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
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

      // Click to drop an emotion
      map.on("click", async (e) => {
        const { lat, lng } = e.latlng;
        const emotion = selectedRef.current;
        const raw = messageRef.current.trim().slice(0, MAX_MESSAGE);
        const payload = {
          emotion,
          lat,
          lng: ((lng + 540) % 360) - 180,
          message: raw.length > 0 ? raw : null,
        };
        const { error } = await supabase.from("emotions").insert(payload);
        if (error) {
          toast.error("Couldn't drop your feeling. Try again.");
          console.error(error);
        } else {
          toast.success(
            `${EMOTIONS_BY_KEY[emotion].emoji} ${EMOTIONS_BY_KEY[emotion].label} dropped`,
          );
          setMessage("");
        }
      });

      // Initial load
      const { data } = await supabase
        .from("emotions")
        .select("id, emotion, lat, lng, message, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (data) {
        setCount(data.length);
        for (const row of data as EmotionRow[]) addMarker(row, false);
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
            setCount((c) => c + 1);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addMarker(row: EmotionRow, isNew: boolean) {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (markersRef.current.has(row.id)) return;

    const meta = EMOTIONS_BY_KEY[row.emotion];
    if (!meta) return;

    const icon = L.divIcon({
      className: "",
      html: `<div class="emotion-dot ${isNew ? "just-added" : ""}" style="background: var(${meta.cssVar}); color: var(${meta.cssVar});" title="${meta.label}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([row.lat, row.lng], { icon, keyboard: false }).addTo(map);

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

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Header overlay */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex flex-col items-start gap-1 p-5 sm:p-7">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-md">
          <span className="size-1.5 rounded-full bg-emotion-hope" />
          Live · {count} feelings dropped
        </div>
        <h1 className="mt-2 max-w-xl text-3xl font-semibold leading-[1.05] sm:text-5xl">
          Feel the&nbsp;world.
        </h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          Anonymous. Pick an emotion, optionally leave a short note, then tap the map.
        </p>
      </header>

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
