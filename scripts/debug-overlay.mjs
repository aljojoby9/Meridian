import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3001";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// sign in
await page.goto(`${BASE}/signin`, { waitUntil: "networkidle2" });
await page.type('input[name="email"]', "user@meridian.local");
await page.type('input[name="password"]', "User123!ChangeMe");
await Promise.all([sleep(200), page.click('button[type="submit"]')]);
for (let i = 0; i < 20; i++) {
  await sleep(500);
  if (page.url().startsWith(BASE) && !page.url().includes("/signin")) break;
}

// show page
await page.goto(`${BASE}/shows/seed-show-1`, { waitUntil: "networkidle2" });
await page.waitForSelector("canvas");
await page.waitForFunction(
  () => {
    const c = document.querySelector("canvas");
    if (!c) return false;
    const r = c.getBoundingClientRect();
    return r.width > window.innerWidth * 0.9;
  },
  { timeout: 30000 },
);
await sleep(800);

// open seat map and pick a seat
await page.click('button[aria-label="Open seat map"]');
await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
await sleep(400);
const seats = await page.$$('[role="dialog"] button[aria-label*="available"]');
console.log("available seats:", seats.length);
const label = await seats[1].evaluate((el) => el.getAttribute("aria-label"));
await seats[1].click();
await sleep(2500);

const state = await page.evaluate((seatLabelText) => {
  const btns = [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  const overlaySearch = [...document.querySelectorAll("div")].filter((d) =>
    (d.className || "").toString().includes("pointer-events-auto"),
  );
  const metricsEl = document.evaluate(
    `//div[.//p[normalize-space()="Seat View"]]`,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue;
  return {
    seatLabelText,
    metricsElFound: !!metricsEl,
    metricsElText: metricsEl ? metricsEl.textContent.slice(0, 220) : null,
    bodyHasSeatView: document.body.innerText.includes("Seat View"),
    bodyHasDistance: document.body.innerText.includes("Distance"),
    bodyHasFov: document.body.innerText.includes("H. FOV"),
    btns,
    overlayCandidates: overlaySearch.length,
  };
}, ((label || "").split(",")[0]));

console.log(JSON.stringify(state, null, 2));
await browser.close();
