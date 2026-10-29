import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { moderateMessage } from "./moderation";
import { normalizeLongitude } from "./coordinates";

const EMOTION_KEYS = ["joy", "calm", "sadness", "anger", "anxiety", "hope"] as const;

const InputSchema = z.object({
  emotion: z.enum(EMOTION_KEYS),
  lat: z.number().min(-90).max(90),
  lng: z.number().finite(),
  message: z.string().max(500).nullable().optional(),
});

const DUP_WINDOW_MS = 60 * 60 * 1000; // 1h

export const submitEmotion = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    // Shared database state survives cookie deletion and server restarts.
    const now = Date.now();

    // 2) Moderate message (if any)
    const moderation = moderateMessage(data.message ?? "");
    if (!moderation.ok) {
      return {
        ok: false as const,
        code: moderation.code,
        reason: moderation.reason,
        params: moderation.params,
      };
    }
    const cleanMessage = moderation.clean.length > 0 ? moderation.clean : null;

    // Resolve server-only dependencies inside the handler, which TanStack
    // removes from the client build. Never load privileged clients in the UI.
    const [{ supabaseAdmin }, { emotionRateLimitSubject }, { getRequestHeader, getRequestIP }] =
      await Promise.all([
        import("@/integrations/supabase/client.server"),
        import("./emotion-rate-limit.server"),
        import("@tanstack/react-start/server"),
      ]);

    const subject = await emotionRateLimitSubject(
      getRequestIP(),
      getRequestHeader("cf-connecting-ip"),
      process.env.EMOTION_TRUST_CLOUDFLARE_IP === "true",
    );
    const { data: wait, error: rateError } = await supabaseAdmin.rpc("claim_emotion_submission", {
      p_subject_hash: subject,
    });
    if (rateError || wait === null) {
      console.error("[submitEmotion] rate limit unavailable", rateError?.code);
      return {
        ok: false as const,
        code: "save_failed" as const,
        reason: "Couldn't save your feeling. Try again.",
      };
    }
    if (wait > 0) {
      return {
        ok: false as const,
        code: "rate" as const,
        reason: `Take a breath — try again in ${wait}s.`,
        params: { sec: wait },
      };
    }

    // 3) Duplicate prevention
    if (cleanMessage) {
      const since = new Date(now - DUP_WINDOW_MS).toISOString();
      const { data: dupes, error: duplicateError } = await supabaseAdmin
        .from("emotions")
        .select("id")
        .eq("message", cleanMessage)
        .gte("created_at", since)
        .limit(1);
      if (duplicateError) {
        return {
          ok: false as const,
          code: "save_failed" as const,
          reason: "Couldn't save your feeling. Try again.",
        };
      }
      if (dupes && dupes.length > 0) {
        return {
          ok: false as const,
          code: "duplicate" as const,
          reason: "Someone just shared that exact thought. Try your own words.",
        };
      }
    }

    // The database rounds to one decimal, including negative halfway values.
    // Avoid rounding twice with different JavaScript/PostgreSQL rules.
    const { error } = await supabaseAdmin.from("emotions").insert({
      emotion: data.emotion,
      lat: data.lat,
      lng: normalizeLongitude(data.lng),
      message: cleanMessage,
    });

    if (error) {
      console.error("[submitEmotion] insert failed", error);
      return {
        ok: false as const,
        code: "save_failed" as const,
        reason: "Couldn't save your feeling. Try again.",
      };
    }

    return { ok: true as const };
  });
