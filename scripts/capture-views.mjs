/**
 * Captures visual proof that every seat has its OWN view:
 *  - the aerial (overhead) frame during the camera flight
 *  - the first-person frame for a front seat
 *  - the first-person frame for a back seat (different rows in view)
 *  - the first-person frame for a far-left seat (different angle)
 *
 * Usage: node scripts/capture-views.mjs [baseUrl] [outDir]
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3001";
const OUT = process.argv[3] || "C:/Users/Aljo Joby/AppData/Local/Temp/opencode";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/signin`, { waitUntil: "networkidle2" });
await page.type('input[name="email"]', "user@meridian.local");
await page.type('input[name="password"]', "User123!ChangeMe");
await Promise.all([sleep(200), page.click('button[type="submit"]')]);
for (let i = 0; i < 20; i++) {
  await sleep(500);
  if (page.url().startsWith(BASE) && !page.url().includes("/signin")) break;
}

await page.goto(`${BASE}/shows/seed-show-1`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");
await page.waitForFunction(
  () => {
    const c = document.querySelector("canvas");
    const r = c && c.getBoundingClientRect();
    return r && r.width > window.innerWidth * 0.9;
  },
  { timeout: 30000 },
);
await sleep(1200);

// Seat inventory (row label + number) straight from the API.
const showId = await page.evaluate(() => window.location.pathname.split("/").pop());
const inventory = await page.evaluate(async (sid) => {
  const res = await fetch(`/api/shows/${sid}/seats`, { cache: "no-store" });
  return (await res.json()).seats;
}, showId);
const byLabel = (l) => inventory.find((s) => `${s.rowLabel}${s.number}` === l);
const rows = [...new Set(inventory.map((s) => s.rowLabel))].sort();
console.log("rows:", rows.join(","));

const pickSeat = async (label) => {
  await page.click('button[aria-label="Open seat map"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await sleep(400);
  const btn = await page.$(`[role="dialog"] button[aria-label^="${label},"]`);
  if (!btn) throw new Error(`seat ${label} not selectable`);
  await btn.click();
  await page
    .waitForFunction(() => window.__meridianCam?.flying === false, { timeout: 25000 })
    .catch(() => {});
  await sleep(900);
  return page.evaluate(() => window.__meridianCam || null);
};

// 1) aerial frame during the overhead hold for a front seat
await page.click('button[aria-label="Open seat map"]');
await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
await sleep(400);
const frontSeat = inventory.find((s) => s.status === "AVAILABLE" && s.rowLabel === rows[0]);
const frontLabel = `${frontSeat.rowLabel}${frontSeat.number}`;
const frontBtn = await page.$(`[role="dialog"] button[aria-label^="${frontLabel},"]`);
await frontBtn.click();
await page.waitForFunction(() => window.__meridianCam?.phase === "hold", { timeout: 15000 }).catch(() => {});
await page.evaluate(() => {
  window.__meridianFreeze = true;
});
await sleep(250);
console.log("aerial:", JSON.stringify(await page.evaluate(() => window.__meridianCam || null)));
await page.screenshot({ path: `${OUT}/meridian-aerial.png` });
await page.evaluate(() => {
  window.__meridianFreeze = false;
});
await page.waitForFunction(() => window.__meridianCam?.flying === false, { timeout: 25000 }).catch(() => {});
await sleep(1000);
console.log("front seat:", frontLabel, JSON.stringify(await page.evaluate(() => window.__meridianCam || null)));
await page.screenshot({ path: `${OUT}/meridian-seat-front.png` });

// 2) a back-row seat (many rows in front of it)
const backSeat = inventory.find((s) => s.status === "AVAILABLE" && s.rowLabel === rows[rows.length - 1]);
const backLabel = `${backSeat.rowLabel}${backSeat.number}`;
const camBack = await pickSeat(backLabel);
console.log("back seat:", backLabel, JSON.stringify(camBack));
await page.screenshot({ path: `${OUT}/meridian-seat-back.png` });

// 3) a far-left seat (different angle)
const leftSeat = inventory.find(
  (s) => s.status === "AVAILABLE" && s.rowLabel === rows[3] && s.colIndex === 0,
) ?? inventory.find((s) => s.status === "AVAILABLE" && s.colIndex === 0 && s.rowIndex >= 3);
const leftLabel = `${leftSeat.rowLabel}${leftSeat.number}`;
const camLeft = await pickSeat(leftLabel);
console.log("left seat:", leftLabel, JSON.stringify(camLeft));
await page.screenshot({ path: `${OUT}/meridian-seat-left.png` });

console.log("screen:", JSON.stringify(await page.evaluate(() => window.__meridianScreen || null)));

await browser.close();
