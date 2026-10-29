import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLongitude } from "../src/lib/coordinates.ts";

test("equivalent positions on repeated world copies share a longitude", () => {
  for (const offset of [-720, -360, 0, 360, 720]) {
    assert.equal(normalizeLongitude(17.125 + offset), 17.125);
    assert.equal(normalizeLongitude(-17.125 + offset), -17.125);
  }
});

test("the dateline has one canonical representation", () => {
  for (const longitude of [-540, -180, 180, 540]) {
    assert.equal(normalizeLongitude(longitude), -180);
  }
  assert.equal(normalizeLongitude(0), 0);
});

test("normalizing does not apply a second privacy rounding rule", () => {
  assert.equal(normalizeLongitude(-17.15), -17.15);
  assert.equal(normalizeLongitude(17.149), 17.149);
  assert.equal(normalizeLongitude(-2.55), -2.55);
  assert.equal(normalizeLongitude(-360.45), -0.45);
  assert.equal(normalizeLongitude(360.45), 0.45);
  assert.equal(normalizeLongitude(1e-10), 1e-10);
});

test("scientific notation and large finite longitudes remain in bounds", () => {
  for (const longitude of [1e21, -1e21, Number.MAX_VALUE, -Number.MAX_VALUE]) {
    const result = normalizeLongitude(longitude);
    assert.ok(result >= -180 && result < 180);
  }
});

test("invalid numeric inputs are rejected", () => {
  for (const longitude of [NaN, Infinity, -Infinity]) {
    assert.throws(() => normalizeLongitude(longitude), RangeError);
  }
});
