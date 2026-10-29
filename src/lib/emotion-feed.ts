import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

export type EmotionRow = Pick<
  Database["public"]["Tables"]["emotions"]["Row"],
  "emotion" | "lat" | "lng" | "message" | "created_at"
>;

export async function readEmotionFeed(
  client: SupabaseClient<Database>,
  windowMs: number,
  signal: AbortSignal,
): Promise<EmotionRow[]> {
  let query = client
    .from("emotions")
    .select("emotion, lat, lng, message, created_at")
    .order("created_at", { ascending: false })
    .limit(1000)
    .abortSignal(signal);
  if (Number.isFinite(windowMs)) {
    query = query.gte("created_at", new Date(Date.now() - windowMs).toISOString());
  }
  const { data, error } = await query;
  if (error || data === null) throw new Error("Emotion feed unavailable");
  return data;
}
