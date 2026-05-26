import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { moderateMessage, RATE_LIMIT_MS } from "./moderation";

const EMOTION_KEYS = ["joy", "calm", "sadness", "anger", "anxiety", "hope"] as const;

const InputSchema = z.object({
  emotion: z.enum(EMOTION_KEYS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  message: z.string().max(500).nullable().optional(),
});

const RATE_COOKIE = "emotion_rl";
const DUP_WINDOW_MS = 60 * 60 * 1000; // 1h

export const submitEmotion = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    // 1) Rate limit (cookie-based, 1/min)
    const last = Number(getCookie(RATE_COOKIE) ?? 0);
    const now = Date.now();
    if (last && now - last < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
      return {
        ok: false as const,
        reason: `Take a breath — try again in ${wait}s.`,
      };
    }

    // 2) Moderate message (if any)
    const moderation = moderateMessage(data.message ?? "");
    if (!moderation.ok) {
      return { ok: false as const, reason: moderation.reason };
    }
    const cleanMessage = moderation.clean.length > 0 ? moderation.clean : null;

    // 3) Duplicate prevention
    if (cleanMessage) {
      const since = new Date(now - DUP_WINDOW_MS).toISOString();
      const { data: dupes } = await supabaseAdmin
        .from("emotions")
        .select("id")
        .eq("message", cleanMessage)
        .gte("created_at", since)
        .limit(1);
      if (dupes && dupes.length > 0) {
        return {
          ok: false as const,
          reason: "Someone just shared that exact thought. Try your own words.",
        };
      }
    }

    // 4) Insert — round coords to ~11km for privacy (also enforced by DB trigger)
    const roundedLat = Math.round(data.lat * 10) / 10;
    const normLng = ((data.lng + 540) % 360) - 180;
    const roundedLng = Math.round(normLng * 10) / 10;
    const { error } = await supabaseAdmin.from("emotions").insert({
      emotion: data.emotion,
      lat: roundedLat,
      lng: roundedLng,
      message: cleanMessage,
    });

    if (error) {
      console.error("[submitEmotion] insert failed", error);
      return { ok: false as const, reason: "Couldn't save your feeling. Try again." };
    }

    // 5) Update rate-limit cookie
    setCookie(RATE_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return { ok: true as const };
  });
