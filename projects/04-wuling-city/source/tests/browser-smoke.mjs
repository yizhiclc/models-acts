// Optional integration check. Install Playwright separately or set PLAYWRIGHT_PATH.
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const output = resolve(process.env.TEST_OUTPUT || "test-results");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_PATH
    ? { executablePath: process.env.BROWSER_PATH }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [],
  failedRequests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("requestfailed", (r) => failedRequests.push(r.url()));
const result = {};
try {
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4173", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => window.wuling?.getSnapshot().ready, {
    timeout: 60000,
  });
  await page.waitForTimeout(1800);
  result.initial = await page.evaluate(() => window.wuling.getSnapshot());
  await page.screenshot({ path: resolve(output, "01-overview.png") });
  assert.ok(result.initial.renderedFrames > 2);
  if (process.env.QUICK === "1") {
    result.errors = errors;
    result.failedRequests = failedRequests;
    console.log(JSON.stringify(result, null, 2));
  } else {
    result.views = [];
    for (let i = 0; i < 5; i++) {
      await page.locator(`[data-view="${i}"]`).click();
      await page.waitForTimeout(2900);
      const s = await page.evaluate(() => window.wuling.getSnapshot());
      assert.equal(s.view, i);
      assert.equal(
        await page.locator(`[data-view="${i}"]`).getAttribute("aria-pressed"),
        "true",
      );
      result.views.push({ index: i, camera: s.camera });
      if (i === 2)
        await page.screenshot({ path: resolve(output, "02-street.png") });
    }
    await page.locator('[data-view="0"]').click();
    await page.waitForTimeout(2800);
    await page.locator('[data-time="sunset"]').click();
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).time,
      "sunset",
    );
    await page.screenshot({ path: resolve(output, "03-sunset.png") });
    await page.locator('[data-time="night"]').click();
    await page.waitForTimeout(500);
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).time,
      "night",
    );
    await page.screenshot({ path: resolve(output, "04-night.png") });
    await page.locator('[data-time="day"]').click();
    await page.keyboard.press("m");
    await page.waitForTimeout(2800);
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).map,
      true,
    );
    await page.screenshot({ path: resolve(output, "05-plan.png") });
    await page.keyboard.press("m");
    await page.locator("#explore").click();
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).mode,
      "flight",
    );
    const before = (await page.evaluate(() => window.wuling.getSnapshot()))
      .camera;
    await page.keyboard.down("w");
    await page.waitForTimeout(650);
    await page.keyboard.up("w");
    const after = (await page.evaluate(() => window.wuling.getSnapshot()))
      .camera;
    assert.ok(Math.hypot(...after.map((n, i) => n - before[i])) > 1);
    result.flight = { before, after };
    await page.keyboard.press("f");
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).mode,
      "orbit",
    );
    await page.keyboard.press("h");
    assert.equal(await page.locator("#restore-ui").isVisible(), true);
    await page.locator("#restore-ui").click();
    await page.locator("#help").click();
    assert.equal(await page.locator("#modal").isVisible(), true);
    await page.keyboard.press("Escape");
    await page.locator("#info").click();
    assert.ok(
      (await page.locator("#modal-content").innerText()).includes(
        "0.2 m / voxel",
      ),
    );
    await page.locator("#close-modal").click();
    await page.locator("#quality").click();
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).quality,
      1,
    );
    await page.locator("#quality").click();
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).quality,
      2,
    );
    await page.locator("#quality").click();
    await page.locator("#sound").click();
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).soundOn,
      true,
    );
    await page.locator("#sound").click();
    await page.locator("#tour").click();
    assert.equal(
      (await page.evaluate(() => window.wuling.getSnapshot())).touring,
      true,
    );
    const tourStart = (await page.evaluate(() => window.wuling.getSnapshot()))
      .view;
    await page.waitForTimeout(10500);
    assert.notEqual(
      (await page.evaluate(() => window.wuling.getSnapshot())).view,
      tourStart,
    );
    await page.locator("#tour").click();
    await page.locator('[data-view="0"]').click();
    await page.waitForTimeout(2800);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({ path: resolve(output, "06-mobile.png") });
    await page.locator("#explore").click();
    assert.equal(await page.locator("#flight-pad").isVisible(), true);
    await page.keyboard.press("f");
    result.final = await page.evaluate(() => window.wuling.getSnapshot());
    result.errors = errors;
    result.failedRequests = failedRequests;
    assert.deepEqual(errors, []);
    assert.deepEqual(failedRequests, []);
    console.log(JSON.stringify(result, null, 2));
  }
  await writeFile(
    resolve(output, "browser-result.json"),
    JSON.stringify(result, null, 2),
  );
} finally {
  await browser.close();
}
