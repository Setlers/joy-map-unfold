import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type L from "leaflet";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useTrainingFeed } from "@/hooks/use-training-feed";
import {
  isTrainingActive,
  remainingTrainingMinutes,
  runnerToken,
  type TrainingSession,
} from "@/lib/running";
import { startTraining, myTraining, endTraining, cheerTraining } from "@/lib/running.functions";
import { shareFeeling, PUBLIC_SITE_URL } from "@/lib/feeling-share";
import { toast } from "sonner";

export function RunningMap() {
  const { t } = useI18n();
  const { rows, loading, error, live, reload } = useTrainingFeed();
  const [now, setNow] = useState(() => Date.now());
  const active = useMemo(() => rows.filter((row) => isTrainingActive(row, now)), [rows, now]);
  const [owner, setOwner] = useState<{ token: string; persisted: boolean } | null>(null);
  const [own, setOwn] = useState<TrainingSession | null>(null);
  const [ownReady, setOwnReady] = useState(false),
    [ownError, setOwnError] = useState(false);
  const [busy, setBusy] = useState(false),
    [cheering, setCheering] = useState(false);
  const [nickname, setNickname] = useState("");
  const [minutes, setMinutes] = useState<30 | 60 | 90>(60);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cheered, setCheered] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const mapElement = useRef<HTMLDivElement | null>(null),
    header = useRef<HTMLElement | null>(null);
  const map = useRef<L.Map | null>(null),
    leaflet = useRef<typeof L | null>(null),
    markers = useRef<L.LayerGroup | null>(null),
    preview = useRef<L.CircleMarker | null>(null);
  const start = useServerFn(startTraining),
    restore = useServerFn(myTraining),
    end = useServerFn(endTraining),
    cheer = useServerFn(cheerTraining);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const ownActive = own !== null && isTrainingActive(own, now);
  const selectedRun = active.find((row) => row.id === selected);
  const anonymous = t("run.anonymous");
  useEffect(() => {
    let storage: Storage | undefined;
    try {
      storage = localStorage;
    } catch {
      /* Memory-only ownership. */
    }
    setOwner(runnerToken(storage));
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    setOwnReady(false);
    setOwnError(false);
    restoreRef
      .current({ data: { token: owner.token }, signal: AbortSignal.timeout(15000) })
      .then((result) => {
        if (!cancelled) {
          setOwn(result);
          setOwnReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setOwnError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);
  useEffect(() => {
    let cancelled = false;
    const update = () => {
      if (header.current && mapElement.current)
        mapElement.current.style.setProperty(
          "--map-header-height",
          `${header.current.getBoundingClientRect().height}px`,
        );
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (header.current) observer?.observe(header.current);
    update();
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapElement.current) return;
      leaflet.current = L;
      const instance = L.map(mapElement.current, {
        center: [24, 10],
        zoom: 3,
        minZoom: 2,
        maxZoom: 16,
        zoomControl: false,
        worldCopyJump: true,
      });
      map.current = instance;
      L.control.zoom({ position: "topright" }).addTo(instance);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { attribution: "© Esri, HERE, Garmin, OSM", maxNativeZoom: 16 },
      ).addTo(instance);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxNativeZoom: 16 },
      ).addTo(instance);
      markers.current = L.layerGroup().addTo(instance);
      instance.on("click", (event) => {
        setPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
        setSelected(null);
      });
      setReady(true);
    })().catch(() => {
      if (!cancelled) setMapError(true);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      markers.current = null;
      preview.current = null;
    };
  }, []);
  useEffect(() => {
    const L = leaflet.current,
      layer = markers.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    for (const row of active) {
      const label = document.createElement("span");
      label.textContent = `${row.nickname ?? anonymous} · ${remainingTrainingMinutes(row, now)} min · 👏 ${row.cheers_count}`;
      const marker = L.marker([row.lat, row.lng], {
        icon: L.divIcon({
          className: "",
          html: '<span class="flex size-8 items-center justify-center rounded-full border border-emerald-300 bg-emerald-950 text-lg shadow-[0_0_20px_#34d39966]">🏃</span>',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(layer);
      marker.bindTooltip(label);
      marker.on("click", () => setSelected(row.id));
    }
  }, [active, ready, anonymous, now]);
  useEffect(() => {
    const L = leaflet.current,
      instance = map.current;
    if (!ready || !L || !instance) return;
    if (preview.current) {
      instance.removeLayer(preview.current);
      preview.current = null;
    }
    if (point && !ownActive)
      preview.current = L.circleMarker([point.lat, point.lng], {
        radius: 10,
        color: "#facc15",
        fillOpacity: 0.3,
      }).addTo(instance);
  }, [point, ownActive, ready]);
  const message = (code: string, wait?: number) =>
    toast.message(t(`run.error.${code}`, { sec: wait ?? 60 }));
  const begin = async () => {
    if (!owner || !point || busy) return;
    setBusy(true);
    try {
      const result = await start({
        data: { token: owner.token, ...point, minutes, nickname },
        signal: AbortSignal.timeout(20000),
      });
      if (!result.ok) {
        message(result.code, "wait" in result ? result.wait : undefined);
        if (result.code === "active") {
          setOwn(await restore({ data: { token: owner.token } }));
        }
        return;
      }
      setOwn(result.session);
      setSelected(null);
      setPoint(null);
      setNow(Date.now());
      toast.success(t("run.started"));
      void reload();
    } catch {
      message("save_failed");
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    if (!owner || !own || busy) return;
    setBusy(true);
    try {
      const result = await end({
        data: { token: owner.token, id: own.id },
        signal: AbortSignal.timeout(20000),
      });
      if (!result.ok) {
        message("save_failed");
        return;
      }
      setOwn({ ...own, ended_at: new Date().toISOString() });
      setSelected(null);
      void reload();
      toast.success(t("run.finished"));
    } catch {
      message("save_failed");
    } finally {
      setBusy(false);
    }
  };
  const encourage = async () => {
    if (!owner || !selectedRun || cheering) return;
    setCheering(true);
    try {
      const result = await cheer({
        data: { token: owner.token, id: selectedRun.id },
        signal: AbortSignal.timeout(20000),
      });
      if (!result.ok) {
        message(result.code);
        if (result.code === "already")
          setCheered((previous) => new Set([...previous, selectedRun.id]));
        return;
      }
      setCheered((previous) => new Set([...previous, selectedRun.id]));
      toast.success(t("run.cheered"));
      void reload();
    } catch {
      message("save_failed");
    } finally {
      setCheering(false);
    }
  };
  const share = async () => {
    const url = new URL("/running", PUBLIC_SITE_URL).toString();
    const result = await shareFeeling(navigator, {
      title: t("run.title"),
      text: t("run.share.text"),
      url,
    });
    if (result === "unavailable")
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t("run.link.copied"));
      } catch {
        setShareLink(url);
      }
  };
  const button =
    "rounded-full border border-border bg-surface/90 px-4 py-2 text-sm disabled:opacity-50";
  return (
    <div className="relative h-dvh overflow-hidden bg-background">
      <div ref={mapElement} className="absolute inset-0" aria-label={t("run.map")} />
      <header
        ref={header}
        className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex flex-wrap items-start justify-between gap-3 p-4 sm:p-7"
      >
        <div className="max-w-md">
          <nav className="pointer-events-auto flex gap-2 text-xs">
            <Link to="/" search={{}} className={button}>
              {t("mode.feelings")}
            </Link>
            <span className={button} aria-current="page">
              🏃 {t("mode.running")}
            </span>
          </nav>
          <h1 className="mt-3 text-3xl font-semibold sm:text-5xl">{t("run.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("run.subtitle")}</p>
          <p className="mt-3 inline-block rounded-full border border-emerald-400/30 bg-surface/90 px-3 py-1.5 text-sm">
            {error
              ? t("run.unavailable")
              : loading && rows.length === 0
                ? t("run.loading")
                : t("run.count", { count: active.length })}
          </p>
          {active.length === 0 && !loading && !error && (
            <p className="mt-2 text-sm">{t("run.empty")}</p>
          )}
          {error && (
            <p
              role="alert"
              className="pointer-events-auto mt-2 rounded-xl border border-border bg-surface/95 p-3 text-sm"
            >
              {t("run.feed.error")}{" "}
              <button onClick={() => void reload()} className="underline">
                {t("feed.retry")}
              </button>
            </p>
          )}
          {!live && !error && (
            <p className="mt-1 text-xs text-muted-foreground">{t("run.refresh")}</p>
          )}
          {rows.length >= 1000 && <p className="text-xs">{t("run.sample")}</p>}
        </div>
        <div className="pointer-events-auto">
          <LanguageSwitcher />
        </div>
      </header>
      {mapError && (
        <div
          role="alert"
          className="absolute inset-x-4 top-1/2 z-[410] rounded-xl border bg-surface p-4"
        >
          {t("run.map.error")}{" "}
          <button onClick={() => window.location.reload()} className="underline">
            {t("feed.retry")}
          </button>
        </div>
      )}
      {selectedRun && (
        <aside
          aria-label={t("run.runner")}
          className="absolute bottom-72 left-4 z-[420] max-w-xs rounded-2xl border border-border bg-surface/95 p-4 shadow-xl sm:bottom-48"
        >
          <button
            aria-label={t("run.close")}
            className="float-right px-2"
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <p className="font-semibold">🏃 {selectedRun.nickname ?? anonymous}</p>
          <p className="mt-1 text-sm">
            {t("run.remaining", { min: remainingTrainingMinutes(selectedRun, now) })}
          </p>
          <p className="mt-1 text-sm">
            👏 {selectedRun.cheers_count} {t("run.cheers")}
          </p>
          {selectedRun.id !== own?.id && (
            <button
              className={`${button} mt-3`}
              disabled={!owner || cheering || cheered.has(selectedRun.id)}
              onClick={() => void encourage()}
            >
              {t(cheered.has(selectedRun.id) ? "run.cheered" : "run.cheer")}
            </button>
          )}
        </aside>
      )}
      <section
        aria-label={t("run.controls")}
        className="absolute inset-x-0 bottom-0 z-[430] mx-auto grid max-h-[48dvh] max-w-lg gap-2 overflow-y-auto p-4"
      >
        <div className="rounded-2xl border border-border bg-surface/95 p-4 shadow-2xl backdrop-blur-md">
          {!ownReady && !ownError && <p role="status">{t("run.restoring")}</p>}
          {ownError && (
            <p role="alert">
              {t("run.owner.error")}{" "}
              <button className="underline" onClick={() => owner && setOwner({ ...owner })}>
                {t("feed.retry")}
              </button>
            </p>
          )}
          {ownReady && ownActive && own && (
            <>
              <p className="font-semibold">🟢 {t("run.you.running")}</p>
              <p className="mt-1 text-sm">
                {t("run.remaining", { min: remainingTrainingMinutes(own, now) })}
              </p>
              <p className="mt-1 text-sm">
                👏 {active.find((row) => row.id === own.id)?.cheers_count ?? own.cheers_count}{" "}
                {t("run.cheers")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("run.owner.note")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={button} disabled={busy} onClick={() => void finish()}>
                  {t("run.finish")}
                </button>
                <button className={button} onClick={() => void share()}>
                  {t("run.share")}
                </button>
              </div>
            </>
          )}
          {ownReady && !ownActive && (
            <>
              {own && (
                <div className="mb-3 rounded-xl bg-emerald-400/10 p-3">
                  <p>{t("run.after")}</p>
                  <Link to="/" search={{}} className="mt-1 inline-block text-sm underline">
                    {t("run.after.action")}
                  </Link>
                </div>
              )}
              <label className="grid gap-1 text-xs text-muted-foreground">
                {t("run.nickname")}
                <input
                  maxLength={30}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="rounded-lg border border-border bg-background p-2 text-sm text-foreground"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  {t("run.duration")}
                  <select
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.target.value) as 30 | 60 | 90)}
                    className="rounded-lg border border-border bg-background p-2 text-foreground"
                  >
                    {[30, 60, 90].map((value) => (
                      <option key={value} value={value}>
                        {value} min
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-40"
                  disabled={!point || busy || !owner || !ready}
                  onClick={() => void begin()}
                >
                  {busy ? t("run.saving") : t("run.start")}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(point ? "run.point.selected" : "run.point.choose")}
              </p>
            </>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">{t("run.privacy")}</p>
          {owner && !owner.persisted && (
            <p role="status" className="mt-2 text-xs">
              {t("run.storage")}
            </p>
          )}
          {shareLink && (
            <label className="mt-2 grid text-xs">
              {t("share.link")}
              <input
                readOnly
                value={shareLink}
                onFocus={(event) => event.target.select()}
                className="mt-1 rounded border bg-background p-2"
              />
            </label>
          )}
        </div>
      </section>
    </div>
  );
}
