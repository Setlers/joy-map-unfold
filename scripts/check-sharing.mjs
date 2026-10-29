import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browserTools = createRequire(
  `${process.env.BROWSER_TEST_TOOLS ?? "/tmp/joy-browser"}/package.json`,
);
const { chromium } = browserTools("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [];
let allowSave = false,
  saves = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem("lang", "en");
    localStorage.setItem("onboarding.dismissed", "1");
    window.__sharingEvents = [];
    window.addEventListener("feel:share", (e) => window.__sharingEvents.push(e.detail));
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedLink = text;
        },
      },
    });
  });
  await context.routeWebSocket("**/realtime/**", (ws) => ws.close());
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") {
      if (route.request().method() === "POST") {
        // Never send a submission to the application server or production database.
        saves++;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: allowSave ? { ok: true } : { ok: false, code: "save_failed" },
            context: {},
          }),
        });
      }
      return route.continue();
    }
    if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/emotions"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: "[]",
      });
    return route.fulfill({
      status: 200,
      contentType: url.pathname.includes("/tile/") ? "image/gif" : "text/css",
      body: url.pathname.includes("/tile/")
        ? Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
        : "",
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "🌱 Hope", exact: true }).click();
  await page.getByRole("textbox", { name: "Optional anonymous message" }).fill("Private test note");
  await page.locator(".leaflet-container").click({ position: { x: 750, y: 600 } });
  await page.getByText("Couldn't save your feeling. Try again.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  console.log("PASS sharing browser: failed saves never show a success/share card");
  allowSave = true;
  await page.locator(".leaflet-container").click({ position: { x: 750, y: 600 } });
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Your feeling can travel further", { exact: true }).waitFor();
  assert.equal(await dialog.getByText("Private test note", { exact: true }).count(), 0);
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await dialog.getByText("Link copied.", { exact: false }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__copiedLink),
    "https://feeltheworld.lovable.app/?feeling=hope&lang=en",
  );
  console.log("PASS sharing browser: saved emotion opens a private-data-free canonical invitation");
  await dialog
    .getByRole("button", { name: "Save image", exact: true })
    .waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Save image" && !b.disabled,
    ),
  );
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save image", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "feel-hope.png");
  await download.saveAs("/tmp/feel-share.png");
  const png = await readFile("/tmp/feel-share.png");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
  console.log("PASS sharing browser: downloadable PNG is 1080 x 1350");
  await page.evaluate(() => {
    window.__copiedLink = "unchanged";
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    });
  });
  await dialog.getByRole("button", { name: "Share my feeling", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector("button[disabled]")?.textContent?.includes("Share my feeling"),
  );
  assert.equal(await page.evaluate(() => window.__copiedLink), "unchanged");
  assert.equal(await dialog.locator("[role=status]").innerText(), "");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__nativeShare = { url: data.url, text: data.text, fileType: data.files?.[0]?.type };
      },
    });
  });
  await dialog.getByRole("button", { name: "Share my feeling", exact: true }).click();
  await dialog.getByText("Shared with your chosen app.", { exact: true }).waitFor();
  const native = await page.evaluate(() => window.__nativeShare);
  assert.equal(native.fileType, "image/png");
  assert.equal(native.url, "https://feeltheworld.lovable.app/?feeling=hope&lang=en");
  assert.ok(!native.text.includes("Private test note"));
  console.log("PASS sharing browser: native image sharing and cancellation semantics");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await dialog.getByText("Select and copy the link above", { exact: false }).waitFor();
  assert.equal(
    await dialog
      .getByRole("textbox", { name: "Invitation link" })
      .evaluate((el) => el.selectionEnd - el.selectionStart),
    "https://feeltheworld.lovable.app/?feeling=hope&lang=en".length,
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Share my saved feeling", exact: true }).click();
  await dialog.waitFor();
  console.log("PASS sharing browser: manual clipboard fallback, Escape and reopening");
  const recipient = await context.newPage();
  recipient.on("pageerror", (e) => errors.push(e.message));
  await recipient.setViewportSize({ width: 390, height: 844 });
  await recipient.goto("http://127.0.0.1:3000/?feeling=hope&lang=sk", { waitUntil: "networkidle" });
  const invite = recipient.getByRole("region", { name: "Pozvanie zdieľať pocit" });
  await invite.waitFor();
  assert.equal(await recipient.getByRole("button", { name: "Dismiss onboarding" }).count(), 0);
  await invite.getByRole("button", { name: "Vybrať môj pocit", exact: true }).click();
  assert.equal(
    await recipient.evaluate(() => document.activeElement?.getAttribute("aria-pressed")),
    "true",
  );
  await recipient.locator(".leaflet-container").click({ position: { x: 180, y: 610 } });
  const recipientDialog = recipient.getByRole("dialog");
  await recipientDialog.getByRole("heading", { name: "Tvoj pocit môže ísť ďalej" }).waitFor();
  assert.ok(await recipient.evaluate(() => document.documentElement.scrollWidth <= 390));
  const box = await recipientDialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.height <= 844);
  await recipient.waitForFunction(() => {
    const button = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent === "Uložiť obrázok",
    );
    return button && !button.disabled;
  });
  assert.ok(
    await recipient.evaluate(() => {
      const zoom = document.querySelector(".leaflet-control-zoom")?.getBoundingClientRect();
      if (!zoom) return false;
      const topmost = document.elementFromPoint(zoom.x + 5, zoom.y + 5);
      return !topmost?.closest(".leaflet-control-zoom");
    }),
  );
  await recipient.screenshot({ path: "/tmp/feel-share-mobile.png" });
  const events = await recipient.evaluate(() => window.__sharingEvents);
  for (const action of ["invite_opened", "invite_accepted", "invite_submitted", "card_opened"])
    assert.ok(events.some((e) => e.action === action));
  assert.ok(events.every((e) => Object.keys(e).sort().join(",") === "action,emotion"));
  console.log("PASS sharing browser: Slovak invitation, recipient conversion and mobile dialog");
  await recipient.goto("http://127.0.0.1:3000/?feeling=__proto__&lang=xx", {
    waitUntil: "networkidle",
  });
  assert.equal(
    await recipient.getByRole("region", { name: "An invitation to share a feeling" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS sharing browser: invalid invitations ignored; no uncaught errors; simulated writes=" +
      saves,
  );
} finally {
  await browser.close();
}
