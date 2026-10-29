import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrainingSessionSchema, type TrainingSession } from "@/lib/running";

export function useTrainingFeed() {
  const [rows, setRows] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const mounted = useRef(false),
    serial = useRef(0),
    abort = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!mounted.current) return;
    const request = ++serial.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    try {
      const result = await supabase
        .from("training_sessions")
        .select("id,nickname,lat,lng,started_at,expires_at,ended_at,cheers_count")
        .is("ended_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(1000)
        .abortSignal(controller.signal);
      if (result.error || result.data === null) throw new Error("Training feed unavailable");
      const parsed = TrainingSessionSchema.array().parse(result.data);
      if (mounted.current && request === serial.current) {
        setRows(parsed);
        setError(false);
      }
    } catch {
      if (mounted.current && request === serial.current) setError(true);
    } finally {
      clearTimeout(timeout);
      if (mounted.current && request === serial.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void reload();
    const interval = setInterval(() => {
      if (!document.hidden) void reload();
    }, 15_000);
    const visible = () => {
      if (!document.hidden) void reload();
    };
    document.addEventListener("visibilitychange", visible);
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    try {
      channel = supabase
        .channel("training-feed")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "training_sessions" },
          () => {
            if (!refresh)
              refresh = setTimeout(() => {
                refresh = undefined;
                void reload();
              }, 250);
          },
        )
        .subscribe((status) => {
          if (!mounted.current) return;
          setLive(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") void reload();
        });
    } catch {
      setLive(false);
    }
    return () => {
      mounted.current = false;
      abort.current?.abort();
      clearInterval(interval);
      clearTimeout(refresh);
      document.removeEventListener("visibilitychange", visible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [reload]);
  return { rows, loading, error, live, reload };
}
