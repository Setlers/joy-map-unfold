import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeelingLink,
  parseSharedFeeling,
  parseShareLanguage,
  PUBLIC_SITE_URL,
  shareFeeling,
} from "../src/lib/feeling-share.ts";

test("invitations accept only the six known emotions and supported languages", () => {
  for (const emotion of ["joy", "calm", "sadness", "anger", "anxiety", "hope"]) {
    assert.equal(parseSharedFeeling(emotion), emotion);
  }
  for (const invalid of [
    undefined,
    null,
    "",
    "__proto__",
    "constructor",
    "HOPE",
    "<script>",
    [],
    {},
    3,
  ]) {
    assert.equal(parseSharedFeeling(invalid), undefined);
  }
  assert.equal(parseShareLanguage("sk"), "sk");
  assert.equal(parseShareLanguage("en"), "en");
  assert.equal(parseShareLanguage("javascript:alert(1)"), undefined);
});

test("links contain only an emotion and language, not private or inherited URL data", () => {
  const result = new URL(
    createFeelingLink(
      "https://user:password@example.com/private?lat=48.1&message=secret#position",
      "hope",
      "sk",
    ),
  );
  assert.equal(result.origin, "https://example.com");
  assert.equal(result.pathname, "/");
  assert.equal(result.username, "");
  assert.equal(result.password, "");
  assert.equal(result.hash, "");
  assert.deepEqual(
    [...result.searchParams],
    [
      ["feeling", "hope"],
      ["lang", "sk"],
    ],
  );
});

test("canonical invitation links round-trip without depending on a preview origin", () => {
  const result = new URL(createFeelingLink(PUBLIC_SITE_URL, "sadness", "en"));
  assert.equal(result.origin, PUBLIC_SITE_URL);
  assert.equal(parseSharedFeeling(result.searchParams.get("feeling")), "sadness");
  assert.equal(parseShareLanguage(result.searchParams.get("lang")), "en");
  assert.throws(() => createFeelingLink("http://example.com", "joy", "en"));
});

const payload = {
  title: "Feel the World",
  text: "A little hope",
  url: createFeelingLink(PUBLIC_SITE_URL, "hope", "en"),
};

test("browsers without native sharing return a clipboard fallback outcome", async () => {
  assert.equal(await shareFeeling({}, payload), "unavailable");
});

test("native sharing includes a PNG only when the platform supports it", async () => {
  const file = new File(["test image"], "feel-hope.png", { type: "image/png" });
  let received: ShareData | undefined;
  assert.equal(
    await shareFeeling(
      {
        canShare: () => true,
        share: async (data) => {
          received = data;
        },
      },
      payload,
      file,
    ),
    "shared",
  );
  assert.deepEqual(received?.files, [file]);
  assert.equal(received?.url, payload.url);
});

test("unsupported file sharing keeps native text and URL sharing", async () => {
  const file = new File(["test"], "feel.png", { type: "image/png" });
  let received: ShareData | undefined;
  assert.equal(
    await shareFeeling(
      {
        canShare: () => false,
        share: async (data) => {
          received = data;
        },
      },
      payload,
      file,
    ),
    "shared",
  );
  assert.deepEqual(received, payload);
});

test("a cancelled share is not a success or an instruction to copy anything", async () => {
  assert.equal(
    await shareFeeling(
      {
        share: async () => {
          throw new DOMException("Cancelled", "AbortError");
        },
      },
      payload,
    ),
    "cancelled",
  );
});

test("a target rejecting mixed image/link content can fall back to just the link", async () => {
  const file = new File(["test"], "feel.png", { type: "image/png" });
  const calls: (ShareData | undefined)[] = [];
  assert.equal(
    await shareFeeling(
      {
        canShare: () => true,
        share: async (data) => {
          calls.push(data);
          if (data?.files) throw new TypeError("Mixed sharing unsupported");
        },
      },
      payload,
      file,
    ),
    "shared",
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], payload);
});

test("capability probe errors cannot break plain URL sharing", async () => {
  const file = new File(["test"], "feel.png", { type: "image/png" });
  let received: ShareData | undefined;
  assert.equal(
    await shareFeeling(
      {
        canShare: () => {
          throw new Error("Probe failed");
        },
        share: async (data) => {
          received = data;
        },
      },
      payload,
      file,
    ),
    "shared",
  );
  assert.deepEqual(received, payload);
});

test("a rejected native share returns a recoverable fallback", async () => {
  assert.equal(
    await shareFeeling(
      {
        share: async () => {
          throw new Error("Share unavailable");
        },
      },
      payload,
    ),
    "unavailable",
  );
});
