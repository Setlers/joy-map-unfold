import assert from "node:assert/strict";
import test from "node:test";
import { emotionRateLimitSubject } from "../src/lib/emotion-rate-limit.server.ts";

test("forwarded headers cannot change the subject unless explicitly trusted", async () => {
  const first = await emotionRateLimitSubject("192.0.2.1", "198.51.100.1", false);
  const second = await emotionRateLimitSubject("192.0.2.1", "198.51.100.2", false);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, await emotionRateLimitSubject("192.0.2.2", undefined, false));
});

test("a trusted Cloudflare address identifies the client instead of the proxy", async () => {
  assert.equal(
    await emotionRateLimitSubject("192.0.2.1", "198.51.100.1", true),
    await emotionRateLimitSubject("198.51.100.1", undefined, false),
  );
});

test("equivalent IPv6 spellings share a limit", async () => {
  assert.equal(
    await emotionRateLimitSubject("2001:db8::1", undefined, false),
    await emotionRateLimitSubject("2001:0db8:0:0:0:0:0:1", undefined, false),
  );
});

test("missing or invalid addresses share a restrictive fallback", async () => {
  const fallback = await emotionRateLimitSubject(undefined, undefined, false);
  assert.equal(fallback, await emotionRateLimitSubject("spoofed", undefined, false));
  assert.equal(fallback, await emotionRateLimitSubject("192.0.2.1", undefined, true));
});
