import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrainingActive,
  remainingTrainingMinutes,
  runnerToken,
  TrainingSessionSchema,
} from "../src/lib/running.ts";
const session = TrainingSessionSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  nickname: null,
  lat: 48.1,
  lng: 17.1,
  started_at: "2026-10-29T10:00:00Z",
  expires_at: "2026-10-29T10:30:00Z",
  ended_at: null,
  cheers_count: 0,
});
test("training is active only before expiry and while not ended", () => {
  assert.equal(isTrainingActive(session, Date.parse("2026-10-29T10:29:59Z")), true);
  assert.equal(isTrainingActive(session, Date.parse(session.expires_at)), false);
  assert.equal(
    isTrainingActive(
      { ...session, ended_at: "2026-10-29T10:10:00Z" },
      Date.parse("2026-10-29T10:11:00Z"),
    ),
    false,
  );
});
test("remaining time never goes negative and rounds up partial minutes", () => {
  assert.equal(remainingTrainingMinutes(session, Date.parse("2026-10-29T10:29:59Z")), 1);
  assert.equal(remainingTrainingMinutes(session, Date.parse("2026-10-29T11:00:00Z")), 0);
});
test("anonymous controls recover the same cryptographic token on reload", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const first = runnerToken(storage),
    second = runnerToken(storage);
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.equal(first.persisted, true);
  assert.equal(first.token, second.token);
});
test("invalid stored tokens are replaced and unavailable storage is explicit", () => {
  const invalid = runnerToken({ getItem: () => "bad", setItem: () => {} });
  assert.notEqual(invalid.token, "bad");
  const unavailable = runnerToken({
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
  });
  assert.equal(unavailable.persisted, false);
  assert.match(unavailable.token, /^[a-f0-9]{64}$/);
});
test("public training records strip private fields and reject invalid timestamps", () => {
  const parsed = TrainingSessionSchema.parse({ ...session, owner_hash: "private" });
  assert.equal("owner_hash" in parsed, false);
  assert.equal(TrainingSessionSchema.safeParse({ ...session, expires_at: "bad" }).success, false);
});
