import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types.ts";
import { readEmotionFeed } from "../src/lib/emotion-feed.ts";

async function withFeedServer(
  respond: (url: URL, response: ServerResponse) => void,
  run: (client: ReturnType<typeof createClient<Database>>) => Promise<void>,
) {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    respond(new URL(request.url!, "http://localhost"), response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = createClient<Database>(`http://127.0.0.1:${address.port}`, "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    await run(client);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const row = {
  emotion: "hope",
  lat: 48.1,
  lng: 17.1,
  message: "Cítim nádej.",
  created_at: "2026-10-29T10:00:00Z",
};

test("a successful empty query is an empty feed, not an error", async () => {
  await withFeedServer(
    (url, response) => {
      assert.equal(url.pathname, "/rest/v1/emotions");
      assert.equal(url.searchParams.get("limit"), "1000");
      assert.equal(url.searchParams.get("order"), "created_at.desc");
      assert.match(url.searchParams.get("created_at")!, /^gte\./);
      response.end("[]");
    },
    async (client) => {
      assert.deepEqual(await readEmotionFeed(client, 60_000, new AbortController().signal), []);
    },
  );
});

test("a failed request rejects and retry can recover with real records", async () => {
  let attempts = 0;
  await withFeedServer(
    (_url, response) => {
      attempts++;
      response.statusCode = attempts === 1 ? 403 : 200;
      response.end(
        JSON.stringify(attempts === 1 ? { message: "Unavailable", code: "42501" } : [row]),
      );
    },
    async (client) => {
      await assert.rejects(
        readEmotionFeed(client, 60_000, new AbortController().signal),
        /unavailable/,
      );
      assert.deepEqual(await readEmotionFeed(client, 60_000, new AbortController().signal), [row]);
      assert.equal(attempts, 2);
    },
  );
});

test("the all-time filter does not accidentally send an invalid date", async () => {
  await withFeedServer(
    (url, response) => {
      assert.equal(url.searchParams.has("created_at"), false);
      response.end(JSON.stringify([row]));
    },
    async (client) => {
      assert.deepEqual(await readEmotionFeed(client, Infinity, new AbortController().signal), [
        row,
      ]);
    },
  );
});

test("a stalled request can be aborted instead of loading forever", async () => {
  const controller = new AbortController();
  await withFeedServer(
    () => controller.abort(),
    async (client) => {
      await assert.rejects(readEmotionFeed(client, 60_000, controller.signal), /unavailable/);
    },
  );
});

test("a response without data is never reported as an empty success", async () => {
  await withFeedServer(
    (_url, response) => response.end("null"),
    async (client) => {
      await assert.rejects(
        readEmotionFeed(client, 60_000, new AbortController().signal),
        /unavailable/,
      );
    },
  );
});
