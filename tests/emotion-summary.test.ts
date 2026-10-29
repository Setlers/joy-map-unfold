import assert from "node:assert/strict";
import test from "node:test";
import { summarizeEmotions } from "../src/lib/emotion-summary.ts";

test("an empty sample has no dominant emotion", () => {
  assert.equal(summarizeEmotions([]), null);
});

test("reports the leading emotion and its count within the supplied sample", () => {
  assert.deepEqual(
    summarizeEmotions([{ emotion: "hope" }, { emotion: "calm" }, { emotion: "hope" }]),
    { keys: ["hope"], count: 2, total: 3 },
  );
});

test("ties include every leading emotion instead of arbitrarily preferring joy", () => {
  assert.deepEqual(
    summarizeEmotions([
      { emotion: "hope" },
      { emotion: "joy" },
      { emotion: "calm" },
      { emotion: "joy" },
      { emotion: "hope" },
    ]),
    { keys: ["joy", "hope"], count: 2, total: 5 },
  );
});

test("input order cannot change the result of a tie", () => {
  const rows = [{ emotion: "hope" }, { emotion: "sadness" }] as const;
  assert.deepEqual(summarizeEmotions(rows), summarizeEmotions([...rows].reverse()));
});
