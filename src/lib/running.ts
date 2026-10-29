import { z } from "zod";

export const TrainingSessionSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string().nullable(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  started_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true }).nullable(),
  cheers_count: z.number().int().nonnegative(),
});
export type TrainingSession = z.infer<typeof TrainingSessionSchema>;
export const TrainingFailureSchema = z.object({
  ok: z.literal(false),
  code: z.enum(["active", "rate", "missing", "own", "already", "save_failed", "nickname"]),
  wait: z.number().optional(),
});
export const StartTrainingResultSchema = z.union([
  z.object({ ok: z.literal(true), session: TrainingSessionSchema }),
  TrainingFailureSchema,
]);
export const CheerTrainingResultSchema = z.union([
  z.object({ ok: z.literal(true), count: z.number().int().nonnegative() }),
  TrainingFailureSchema,
]);
export function isTrainingActive(session: TrainingSession, now = Date.now()) {
  return session.ended_at === null && Date.parse(session.expires_at) > now;
}
export function remainingTrainingMinutes(session: TrainingSession, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(session.expires_at) - now) / 60_000));
}
export function runnerToken(storage?: Pick<Storage, "getItem" | "setItem">) {
  try {
    const saved = storage?.getItem("runner-owner-v1");
    if (saved && /^[a-f0-9]{64}$/.test(saved)) return { token: saved, persisted: true };
  } catch {
    /* Storage is optional. */
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  try {
    if (storage) {
      storage.setItem("runner-owner-v1", token);
      return { token, persisted: true };
    }
  } catch {
    /* The state will still expire. */
  }
  return { token, persisted: false };
}
