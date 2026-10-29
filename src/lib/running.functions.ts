import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { moderateMessage } from "./moderation";
import { normalizeLongitude } from "./coordinates";
import {
  TrainingSessionSchema,
  StartTrainingResultSchema,
  CheerTrainingResultSchema,
} from "./running";
const Owner = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });
const Session = Owner.extend({ id: z.string().uuid() });
const failure = { ok: false as const, code: "save_failed" as const };
export const myTraining = createServerFn({ method: "POST" })
  .inputValidator((input) => Owner.parse(input))
  .handler(async ({ data }) => {
    const { client, ownerHash } = await (
      await import("./running.server")
    ).trainingDependencies(data.token);
    const result = await client.rpc("my_training", { p_owner_hash: ownerHash });
    if (result.error) throw new Error("Training state unavailable");
    return result.data === null ? null : TrainingSessionSchema.parse(result.data);
  });
export const startTraining = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    Owner.extend({
      lat: z.number().min(-90).max(90),
      lng: z.number().finite(),
      minutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
      nickname: z.string().trim().max(30),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const checked = moderateMessage(data.nickname);
    if (!checked.ok) return { ok: false as const, code: "nickname" as const };
    const { client, ownerHash, subjectHash } = await (
      await import("./running.server")
    ).trainingDependencies(data.token);
    const result = await client.rpc("start_training", {
      p_owner_hash: ownerHash,
      p_subject_hash: subjectHash,
      p_lat: data.lat,
      p_lng: normalizeLongitude(data.lng),
      p_minutes: data.minutes,
      p_nickname: checked.clean || null,
    });
    if (result.error) return failure;
    const parsed = StartTrainingResultSchema.safeParse(result.data);
    return parsed.success ? parsed.data : failure;
  });
export const endTraining = createServerFn({ method: "POST" })
  .inputValidator((input) => Session.parse(input))
  .handler(async ({ data }) => {
    const { client, ownerHash } = await (
      await import("./running.server")
    ).trainingDependencies(data.token);
    const result = await client.rpc("end_training", {
      p_owner_hash: ownerHash,
      p_session_id: data.id,
    });
    return { ok: !result.error && result.data === true };
  });
export const cheerTraining = createServerFn({ method: "POST" })
  .inputValidator((input) => Session.parse(input))
  .handler(async ({ data }) => {
    const { client, ownerHash, subjectHash } = await (
      await import("./running.server")
    ).trainingDependencies(data.token);
    const result = await client.rpc("cheer_training", {
      p_owner_hash: ownerHash,
      p_subject_hash: subjectHash,
      p_session_id: data.id,
    });
    if (result.error) return failure;
    const parsed = CheerTrainingResultSchema.safeParse(result.data);
    return parsed.success ? parsed.data : failure;
  });
