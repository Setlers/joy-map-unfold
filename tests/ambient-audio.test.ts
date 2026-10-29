import assert from "node:assert/strict";
import test from "node:test";
import { createAmbientAudioController, type AmbientAudioState } from "../src/lib/ambient-audio.ts";

class FakeAudio extends EventTarget {
  paused = true;
  volume = 1;
  playCalls = 0;
  pauseCalls = 0;
  playResult: () => Promise<void> = () => Promise.resolve();
  play() {
    this.paused = false;
    this.playCalls++;
    return this.playResult();
  }
  pause() {
    this.paused = true;
    this.pauseCalls++;
  }
}

function setup(timeoutMs = 15_000) {
  const audio = new FakeAudio();
  const states: AmbientAudioState[] = [];
  const preferences: boolean[] = [];
  const controller = createAmbientAudioController(
    audio,
    (state) => states.push(state),
    (on) => preferences.push(on),
    timeoutMs,
  );
  return { audio, states, preferences, controller };
}
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test("only a playing event confirms playback and saves the preference", async () => {
  const { audio, states, preferences, controller } = setup();
  try {
    controller.start();
    assert.equal(audio.playCalls, 1);
    assert.equal(audio.volume, 0.12);
    await settle();
    assert.deepEqual(states, ["loading"]);
    assert.deepEqual(preferences, []);
    audio.dispatchEvent(new Event("playing"));
    assert.equal(states.at(-1), "playing");
    assert.deepEqual(preferences, [true]);
  } finally {
    controller.destroy();
  }
});

test("blocked autoplay is distinct from missing media and can be retried", async () => {
  const { audio, states, preferences, controller } = setup();
  try {
    audio.playResult = () => Promise.reject(new DOMException("Blocked", "NotAllowedError"));
    controller.start();
    await settle();
    assert.equal(states.at(-1), "blocked");
    assert.equal(preferences.at(-1), false);
    audio.playResult = () => Promise.resolve();
    controller.start();
    audio.dispatchEvent(new Event("playing"));
    assert.equal(states.at(-1), "playing");
  } finally {
    controller.destroy();
  }
});

test("a media error clears the on preference and offers a retry", () => {
  const { audio, states, preferences, controller } = setup();
  try {
    controller.start();
    audio.dispatchEvent(new Event("playing"));
    audio.dispatchEvent(new Event("error"));
    assert.equal(states.at(-1), "error");
    assert.equal(preferences.at(-1), false);
    controller.start();
    assert.equal(states.at(-1), "loading");
  } finally {
    controller.destroy();
  }
});

test("a stale play rejection cannot overwrite a newer playback attempt", async () => {
  const { audio, states, controller } = setup();
  let rejectOld!: (error: Error) => void;
  try {
    audio.playResult = () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      });
    controller.start();
    controller.stop();
    audio.playResult = () => Promise.resolve();
    controller.start();
    audio.dispatchEvent(new Event("playing"));
    rejectOld(new Error("Old attempt failed"));
    await settle();
    assert.equal(states.at(-1), "playing");
  } finally {
    controller.destroy();
  }
});

test("turning off pending playback suppresses late playing events", () => {
  const { audio, states, preferences, controller } = setup();
  try {
    controller.start();
    controller.toggle();
    audio.dispatchEvent(new Event("playing"));
    assert.equal(states.at(-1), "off");
    assert.equal(preferences.at(-1), false);
    assert.equal(audio.pauseCalls, 2);
  } finally {
    controller.destroy();
  }
});

test("unmount removes listeners and ignores pending promise failures", async () => {
  const { audio, states, preferences, controller } = setup();
  let rejectPlay!: (error: Error) => void;
  audio.playResult = () =>
    new Promise((_resolve, reject) => {
      rejectPlay = reject;
    });
  controller.start();
  controller.destroy();
  const before = states.length;
  audio.dispatchEvent(new Event("playing"));
  rejectPlay(new Error("Disposed"));
  await settle();
  assert.equal(states.length, before);
  assert.deepEqual(preferences, []);
  assert.equal(audio.pauseCalls, 1);
});

test("stalled loading times out instead of showing sound on", async () => {
  const { states, controller } = setup(5);
  try {
    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(states.at(-1), "error");
  } finally {
    controller.destroy();
  }
});

test("external pause updates the displayed and persisted state", () => {
  const { audio, states, preferences, controller } = setup();
  try {
    controller.start();
    audio.dispatchEvent(new Event("playing"));
    audio.paused = true;
    audio.dispatchEvent(new Event("pause"));
    assert.equal(states.at(-1), "off");
    assert.equal(preferences.at(-1), false);
  } finally {
    controller.destroy();
  }
});

test("a queued pause from an older attempt cannot cancel resumed playback", () => {
  const { audio, states, controller } = setup();
  try {
    controller.start();
    controller.stop();
    controller.start();
    audio.dispatchEvent(new Event("playing"));
    audio.dispatchEvent(new Event("pause"));
    assert.equal(states.at(-1), "playing");
  } finally {
    controller.destroy();
  }
});
