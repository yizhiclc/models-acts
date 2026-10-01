// Additional checks of actual pointer controls and a touch-emulated viewport.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const out = resolve(process.env.TEST_OUTPUT || "test-results");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
  errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(r.url()))
    external.push(r.url());
});
try {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(() => window.wuling?.getSnapshot().ready);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(out, "09-final-overview.png") });
  await page.locator('[data-view="1"]').click();
  await page.waitForTimeout(2750);
  await page.screenshot({ path: resolve(out, "10-core-facing-east.png") });
  await page.locator('[data-view="0"]').click();
  await page.waitForTimeout(2750);
  let before = (await page.evaluate(() => window.wuling.getSnapshot())).camera;
  await page.mouse.move(920, 650);
  await page.mouse.down();
  await page.mouse.move(1100, 590, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  let after = (await page.evaluate(() => window.wuling.getSnapshot())).camera;
  assert.ok(Math.hypot(...after.map((v, i) => v - before[i])) > 10);
  before = after;
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(650);
  after = (await page.evaluate(() => window.wuling.getSnapshot())).camera;
  assert.ok(Math.hypot(...after.map((v, i) => v - before[i])) > 1);
  await page.keyboard.press("r");
  await page.waitForTimeout(2750);
  await page.keyboard.press("m");
  await page.waitForTimeout(2500);
  const map = await page.evaluate(() => window.wuling.getSnapshot());
  assert.equal(map.map, true);
  assert.ok(map.camera[1] > 300);
  await page.screenshot({ path: resolve(out, "07-final-plan.png") });
  await page.keyboard.press("f");
  assert.equal(
    (await page.evaluate(() => window.wuling.getSnapshot())).map,
    false,
  );
  assert.equal(
    (await page.evaluate(() => window.wuling.getSnapshot())).mode,
    "flight",
  );
  await page.keyboard.press("f");
  await page.keyboard.press("r");
  await page.waitForTimeout(2700);
  await page.locator("#fullscreen").click();
  assert.equal(
    await page.evaluate(() => Boolean(document.fullscreenElement)),
    true,
  );
  await page.locator("#fullscreen").click();
  assert.equal(
    await page.evaluate(() => Boolean(document.fullscreenElement)),
    false,
  );
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const p = await mobile.newPage();
  await p.goto(process.env.BASE_URL || "http://127.0.0.1:4173");
  await p.waitForFunction(() => window.wuling?.getSnapshot().ready);
  await p.waitForTimeout(1000);
  await p.screenshot({ path: resolve(out, "08-mobile-initial.png") });
  await p.getByRole("button", { name: "入城漫游" }).tap();
  assert.equal(await p.locator("#flight-pad").isVisible(), true);
  const b = (await p.evaluate(() => window.wuling.getSnapshot())).camera;
  const btn = p.locator('[data-key="KeyW"]'),
    r = await btn.boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(450);
  await p.mouse.up();
  const a = (await p.evaluate(() => window.wuling.getSnapshot())).camera;
  assert.ok(Math.hypot(...a.map((n, i) => n - b[i])) > 1);
  await mobile.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = {
    passed: true,
    orbitDrag: true,
    wheelZoom: true,
    planCamera: map.camera,
    fullscreen: true,
    touchEmulatedEntry: true,
    onScreenFlightMovement: true,
    externalRequests: external,
    consoleErrors: errors,
    browser: browser.version(),
  };
  await writeFile(
    resolve(out, "interaction-result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
