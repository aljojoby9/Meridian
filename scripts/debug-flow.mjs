import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3001";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/signin`, { waitUntil: "networkidle2" });
await page.type('input[name="email"]', "user@meridian.local");
await page.type('input[name="password"]', "User123!ChangeMe");
await Promise.all([sleep(200), page.click('button[type="submit"]')]);
for (let i = 0; i < 20; i++) {
  await sleep(500);
  if (page.url().startsWith(BASE) && !page.url().includes("/signin")) break;
}
console.log("url after login:", page.url());
console.log("cookies:", (await page.cookies()).map((c) => `${c.name}=${c.value.slice(0, 18)}…(httpOnly=${c.httpOnly})`).join("\n  "));

const me = await page.evaluate(async () => {
  const r = await fetch("/signin", { headers: { "x-debug": "1" } });
  return r.status;
});

await page.goto(`${BASE}/shows/seed-show-1`, { waitUntil: "networkidle2" });
await page.waitForSelector("canvas");
await page.waitForFunction(() => {
  const c = document.querySelector("canvas");
  const r = c && c.getBoundingClientRect();
  return r && r.width > 1000;
});
await sleep(900);

await page.click('button[aria-label="Open seat map"]');
await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
await sleep(500);
const seats = await page.$$('[role="dialog"] button[aria-label*="available"]');
console.log("available seats:", seats.length);
await seats[1].click();
await sleep(1600);

const state = await page.evaluate(() => {
  const t = document.body.innerText;
  const panel = document.querySelector('[aria-label="Seat selection and checkout"]');
  const overlay = [...document.querySelectorAll("div")].find((d) => d.textContent.startsWith("Seat View"));
  return {
    url: location.href,
    hasPanel: !!panel,
    panelText: panel ? panel.firstElementChild.textContent.slice(0, 120) : null,
    hasMetricsHeading: t.includes("Seat View"),
    hasDistance: t.includes("Distance"),
    hasSweetSpotOrLabel: t.includes("Sweet Spot") || t.includes("Up Close") || t.includes("Full Picture"),
    overlayText: overlay ? overlay.textContent.slice(0, 200) : null,
    continueBtn: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((x) => /continue|holding|redirect/i.test(x)),
  };
});
console.log(JSON.stringify(state, null, 2));
await browser.close();
