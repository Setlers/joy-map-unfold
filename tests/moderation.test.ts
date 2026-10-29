import assert from "node:assert/strict";
import test from "node:test";
import { moderateMessage } from "../src/lib/moderation.ts";

const allowed = [
  "Dnes mám krásny deň.",
  "Čaká ma kariéra v novej práci.",
  "Objednal som si kokosový koláč.",
  "Kokos a káva mi zlepšili deň.",
  "Som Žid a dnes oslavujem s rodinou.",
  "Som černoch a cítim nádej.",
  "Classic music makes me happy.",
  "I visited Scunthorpe today.",
  "The kitchen smells of spices.",
  "That cocktail was lovely.",
  "I was born in a beautiful town.",
  "I wish it would rain.",
  "Our shipment arrived today.",
  "Wishing everyone a peaceful evening!",
];

for (const message of allowed) {
  test(`allows ordinary text: ${message}`, () => {
    assert.deepEqual(moderateMessage(message), { ok: true, clean: message });
  });
}

for (const message of [
  "fuck",
  "fucking",
  "fucker",
  "bullshit",
  "bitches",
  "That is shit!",
  "bitch",
  "kurva",
  "piča",
  "kokot",
  "debilný",
  "vyjebaný",
  "f u c k",
  "f.u.c.k",
  "f*u*c*k",
  "f*ck",
  "fuuuck",
  "sh1t",
  "$hit",
  "b!tch",
  "k0k0t",
  "p i č a",
  "fu\u200bck",
  "pic\u030ca",
  "faggot",
  "skurvený",
  "kurvy",
]) {
  test(`rejects prohibited text: ${message}`, () => {
    const result = moderateMessage(message);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "profanity");
  });
}

test("empty optional messages and trimming still work", () => {
  for (const input of [null, undefined, "", "   "]) {
    assert.deepEqual(moderateMessage(input), { ok: true, clean: "" });
  }
  assert.deepEqual(moderateMessage("  Cítim pokoj.  "), { ok: true, clean: "Cítim pokoj." });
});

test("long masking runs are handled without treating every symbol as a letter", () => {
  for (const input of ["f" + "*".repeat(110) + "z", "*".repeat(120)]) {
    const result = moderateMessage(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "spam");
  }
});

for (const [message, code] of [
  ["a".repeat(121), "too_long"],
  ["Visit https://example.com", "no_links"],
  ["Visit example.sk", "no_links"],
  ["hello hello hello hello", "spam"],
  ["aaaaaaaa", "spam"],
  ["THIS IS VERY LOUD", "spam"],
] as const) {
  test(`preserves ${code} check`, () => {
    const result = moderateMessage(message);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, code);
  });
}
