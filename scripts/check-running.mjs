import { createRequire } from "node:module";
import assert from "node:assert/strict";
const tools = createRequire(`${process.env.BROWSER_TEST_TOOLS ?? "/tmp/joy-browser"}/package.json`);
const { chromium } = tools("playwright-core");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ownerId = "00000000-0000-4000-8000-000000000001",
  friendId = "00000000-0000-4000-8000-000000000002";
let friend = {
  id: friendId,
  nickname: "Runner <safe>",
  lat: 48.1,
  lng: 17.1,
  started_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  ended_at: null,
  cheers_count: 0,
};
let own = null,
  ownerToken = null,
  action = "restore",
  failStart = true,
  failFeed = false;
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("lang", "sk");
    localStorage.setItem("onboarding.dismissed", "1");
  });
  await context.routeWebSocket("**/realtime/**", (ws) => ws.close());
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") {
      if (route.request().method() === "POST") {
        const body = route.request().postData() ?? "";
        const token = body.match(/[a-f0-9]{64}/)?.[0];
        let result = null;
        if (body.includes('"minutes"')) {
          if (failStart) result = { ok: false, code: "save_failed" };
          else {
            ownerToken = token;
            own = {
              id: ownerId,
              nickname: "Zuzana",
              lat: 48.2,
              lng: 17.2,
              started_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 1800000).toISOString(),
              ended_at: null,
              cheers_count: 0,
            };
            result = { ok: true, session: own };
          }
        } else if (body.includes('"id"') && action === "cheer") {
          friend = { ...friend, cheers_count: 1 };
          result = { ok: true, count: 1 };
        } else if (body.includes('"id"') && action === "end") {
          own = { ...own, ended_at: new Date().toISOString() };
          result = { ok: true };
        } else result = token === ownerToken ? own : null;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ result, context: {} }),
        });
      }
      return route.continue();
    }
    if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/")) {
      if (url.pathname.includes("training_sessions")) {
        if (failFeed)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"message":"Test unavailable"}',
          });
        const rows = [friend, own].filter(
          (row) => row && row.ended_at === null && Date.parse(row.expires_at) > Date.now(),
        );
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(rows),
          headers: { "access-control-allow-origin": "*" },
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
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
  await page.goto("http://127.0.0.1:3000/running", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Netrénuješ sám." }).waitFor();
  await page.getByText("Aktívne tréningy na mape: 1", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon").length === 1);
  await page.locator(".leaflet-marker-icon").first().click();
  const details = page.getByRole("complementary", { name: "Detail bežca" });
  await details.getByText("Runner <safe>", { exact: false }).waitFor();
  action = "cheer";
  await details.getByRole("button", { name: "👏 Držím palce!", exact: true }).click();
  await details.getByRole("button", { name: "Povzbudenie odoslané", exact: true }).waitFor();
  assert.equal(
    await details.getByRole("button", { name: "Povzbudenie odoslané", exact: true }).isDisabled(),
    true,
  );
  console.log("PASS running browser: public runner, escaped nickname and encouragement");
  await page.getByRole("button", { name: "Zavrieť detail bežca" }).click();
  await page
    .getByRole("textbox", { name: "Prezývka (nepovinná, najviac 30 znakov)" })
    .fill("Zuzana");
  await page.getByRole("combobox", { name: "Plánované trvanie" }).selectOption("30");
  await page.locator(".leaflet-container").click({ position: { x: 750, y: 500 } });
  await page.getByRole("button", { name: "Idem behať", exact: true }).click();
  await page.getByText("Zmenu sa nepodarilo uložiť. Skús to znova.", { exact: true }).waitFor();
  assert.equal(await page.getByText("Tvoj tréning je aktívny", { exact: false }).count(), 0);
  failStart = false;
  await page.getByRole("button", { name: "Idem behať", exact: true }).click();
  await page.getByText("Tvoj tréning je aktívny", { exact: false }).waitFor();
  console.log("PASS running browser: failed start is honest; successful start appears");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Tvoj tréning je aktívny", { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const h = document.querySelector("header")?.getBoundingClientRect();
    const z = document.querySelector(".leaflet-control-zoom")?.getBoundingClientRect();
    return h && z && z.top >= h.bottom;
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await page.screenshot({ path: "/tmp/running-mobile.png" });
  console.log("PASS running browser: reload restores controls; mobile layout fits");
  action = "end";
  await page.getByRole("button", { name: "Mám hotovo", exact: true }).click();
  await page.getByText("Dobehané. Ako sa cítiš?", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Zdieľať pocit po behu", exact: true }).click();
  await page.getByRole("textbox", { name: "Nepovinný anonymný odkaz" }).waitFor();
  console.log("PASS running browser: owner can finish and return to feelings");
  friend = { ...friend, expires_at: new Date(Date.now() + 1500).toISOString() };
  await page.clock.install({ time: new Date() });
  await page.goto("http://127.0.0.1:3000/running", { waitUntil: "networkidle" });
  await page.getByText("Aktívne tréningy na mape: 1", { exact: true }).waitFor();
  await page.clock.fastForward(20000);
  await page.getByText("Aktívne tréningy na mape: 0", { exact: true }).waitFor();
  console.log("PASS running browser: automatic expiry removes an active point");
  failFeed = true;
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("alert").filter({ hasText: "Tréningy sa nepodarilo obnoviť." }).waitFor();
  assert.equal(await page.getByText("Rozsvieť prvý bod na mape.", { exact: false }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS running browser: feed failure visible; no uncaught page errors; no real writes",
  );
} finally {
  await browser.close();
}
