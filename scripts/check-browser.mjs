import { createRequire } from "node:module";
const browserTools = createRequire(
  `${process.env.BROWSER_TEST_TOOLS ?? "/tmp/joy-browser"}/package.json`,
);
const { chromium } = browserTools("playwright-core");
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  let failFeed = true;
  let reads = 0;
  let rows = [];
  await page.routeWebSocket("**/realtime/**", (ws) => ws.close());
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/emotions")) {
      reads++;
      return route.fulfill({
        status: failFeed ? 503 : 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: failFeed ? JSON.stringify({ message: "Test unavailable" }) : JSON.stringify(rows),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: url.pathname.includes("/tile/") ? "image/gif" : "text/css",
      body: url.pathname.includes("/tile/")
        ? Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
        : "",
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem("onboarding.dismissed", "1");
    localStorage.setItem("lang", "en");
  });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.getByRole("alert").filter({ hasText: "Couldn't load feelings" }).waitFor();
  assert.equal(
    await page.getByText("No feelings in this time range yet.", { exact: false }).count(),
    0,
  );
  console.log("PASS browser: database failure is visible and not presented as empty");
  failFeed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("No feelings in this time range yet.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  console.log("PASS browser: retry recovers and shows genuine empty state");
  await page.getByRole("button", { name: "SK", exact: true }).click();
  await page.getByRole("tab", { name: "7 dní", exact: true }).click();
  await page.getByText("V tomto období zatiaľ nie sú žiadne pocity.", { exact: false }).waitFor();
  rows = ["joy", "hope", "joy", "hope"].map((emotion, index) => ({
    emotion,
    lat: 48 + index,
    lng: 17 + index,
    message: null,
    created_at: new Date(Date.now() - index * 1000).toISOString(),
  }));
  await page.getByRole("tab", { name: "24 h", exact: true }).click();
  await page.getByText("Zhoda: Radosť / Nádej", { exact: false }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".emotion-dot").length === 4);
  console.log("PASS browser: fetched records render as map markers and ties are shown");
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await page.getByText("Teplejšie farby znamenajú viac aktivity", { exact: false }).waitFor();
  console.log("PASS browser: Slovak labels, time filter and activity toggle");
  await page.getByRole("button", { name: "Zvuk vyp.", exact: true }).click();
  await page.getByText("Zvuk sa nepodarilo prehrať.", { exact: false }).waitFor({ timeout: 20000 });
  assert.equal(
    await page
      .getByRole("button", { name: "Skúsiť zvuk znova", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  console.log("PASS browser: missing audio reports an error instead of sound on");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const header = document.querySelector("header")?.parentElement;
    const zoom = document.querySelector(".leaflet-control-zoom");
    return (
      header && zoom && zoom.getBoundingClientRect().top >= header.getBoundingClientRect().bottom
    );
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  for (const button of await page.locator("header + div button").all()) {
    const box = await button.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
  }
  console.log("PASS browser: mobile controls fit and zoom does not overlap the header");
  await page.screenshot({ path: "/tmp/joy-mobile.png" });
  assert.deepEqual(errors, []);
  console.log("PASS browser: no uncaught page errors; requests=" + reads);
} finally {
  await browser.close();
}
