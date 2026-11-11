import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.argv[2] || "http://localhost:3001";
const browser = await puppeteer.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  headless: "new",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/shows/seed-show-1`, { waitUntil: "networkidle2" });
await page.waitForSelector("canvas");
await new Promise((r) => setTimeout(r, 1500));

const info = await page.evaluate(() => {
  const out = [];
  let el = document.querySelector("canvas");
  while (el && el !== document.documentElement) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    out.push({
      tag: el.tagName,
      cls: (el.className || "").toString().slice(0, 90),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cssH: s.height,
      cssW: s.width,
      display: s.display,
    });
    el = el.parentElement;
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
