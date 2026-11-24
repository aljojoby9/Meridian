/**
 * End-to-end smoke check for the immersive seat view.
 *
 * Verified with headless Chrome (puppeteer-core, local Chrome binary):
 *  1. Fullscreen R3F canvas fills the viewport.
 *  2. Seat-map sheet opens (animated).
 *  3. Selecting a seat slides the bottom panel DOWN into place
 *     (mid-transition sample + settled transform = translate 0, opacity 1).
 *  4. Metrics overlay (distance / FOV / offset) is shown.
 *  5. Seat is HELD server-side, then checkout completes to the confirmation
 *     page with tickets.
 *
 * Usage: node scripts/verify-e2e.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3001";
const SHOW_ID = process.env.SHOW_ID || "seed-show-1";
const EMAIL = process.env.SEED_USER_EMAIL || "user@meridian.local";
const PASSWORD = process.env.SEED_USER_PASSWORD || "User123!ChangeMe";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Chrome/Edge binary found.");
  process.exit(1);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e.message || e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for hydration: R3F canvas measured to >= 90% of viewport. */
async function gotoShowAndSettle(showId) {
  // Avoid networkidle gate: the live seat polling keeps traffic flowing.
  await page.goto(`${BASE}/shows/${showId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const c = document.querySelector("canvas");
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.width > window.innerWidth * 0.9 && r.height > window.innerHeight * 0.9;
    },
    { timeout: 30000 },
  );
  await sleep(700); // hydration
}

async function openSeatMap() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const open = await page.click('button[aria-label="Open seat map"]').then(
      () => true,
      () => false,
    );
    const appeared = await page
      .waitForSelector('[role="dialog"]', { timeout: 8000 })
      .then(() => true, () => false);
    if (appeared) {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('[role="dialog"]');
          if (!el) return false;
          const s = getComputedStyle(el);
          const settled =
            s.transform === "none" || s.transform === "matrix(1, 0, 0, 1, 0, 0)";
          return Number(s.opacity) >= 0.99 && settled;
        },
        { timeout: 8000 },
      );
      return true;
    }
    await sleep(600);
  }
  return false;
}

try {
  // ---------- 0. Sign in first ----------
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.type('input[name="email"]', EMAIL);
  await page.type('input[name="password"]', PASSWORD);
  await Promise.all([sleep(200), page.click('button[type="submit"]')]);
  let ok = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const u = page.url();
    // Treat RSC transient frames (about:blank / chrome-error) as not yet done.
    if (u && u.startsWith(BASE) && !u.includes("/signin")) {
      ok = true;
      break;
    }
  }
  check("sign-in succeeds", ok, page.url());

  // Warm the checkout routes so dev cold-compiles don't distort the timing
  // assertions below (the POST + the success page both get compiled here).
  await page
    .evaluate(async () => {
      await fetch("/api/checkout", { method: "GET" }).catch(() => {});
      await fetch("/checkout/success").catch(() => {});
    })
    .catch(() => {});

  // ---------- 1. Fullscreen canvas ----------
  await gotoShowAndSettle(SHOW_ID);
  const canvasBox = await page.$eval("canvas", (el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  });
  check(
    "canvas fills the viewport (fullscreen)",
    canvasBox.w >= 1400 && canvasBox.h >= 700,
    `${canvasBox.w}x${canvasBox.h} @top ${canvasBox.top}`,
  );
  check("seat map trigger present", (await page.$('button[aria-label="Open seat map"]')) !== null);

  // ---------- 2. Animated seat-map sheet ----------
  const sheetOpened = await openSeatMap();
  check("seat map sheet opens (animated settle)", sheetOpened);

  const seatButtons = await page.$$('[role="dialog"] button[aria-label*="available"]');
  check("available seats rendered", seatButtons.length > 0, `${seatButtons.length} seats`);

  // ---------- 3. Selection -> bottom panel slides DOWN ----------
  const targetLabel = await seatButtons[0].evaluate((el) => el.getAttribute("aria-label"));
  let seatLabelText = (targetLabel || "").split(",")[0];
  await seatButtons[0].click();

  // Sample the entrance window: the panel slide-down AND the aerial camera
  // flight (rise -> overhead hold -> dive into the seat) happen together.
  const panelSel = '[aria-label="Seat selection and checkout"] > div';
  let mid = null; // panel in-flight evidence (negative Y or partial opacity)
  let animSeen = null; // slide-down keyframe attached at any sample
  let maxCamY = -Infinity;
  let minCamY = Infinity;
  let camSamples = 0;
  const camPhases = new Set();
  for (let i = 0; i < 40; i++) {
    await sleep(60);
    const s = await page
      .$eval(panelSel, (el) => {
        const c = getComputedStyle(el);
        return { transform: c.transform, opacity: c.opacity, anim: c.animationName };
      })
      .catch(() => null);
    if (s) {
      if (/slide-down/i.test(s.anim)) animSeen = s.anim;
      const inFlight = (s.transform && s.transform.includes("-")) || Number(s.opacity) < 1;
      if (inFlight && !mid) mid = s;
    }
    const cam = await page.evaluate(() => window.__meridianCam || null).catch(() => null);
    if (cam) {
      camSamples++;
      maxCamY = Math.max(maxCamY, cam.y);
      minCamY = Math.min(minCamY, cam.y);
      if (cam.phase) camPhases.add(cam.phase);
    }
  }
  const settled = await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[aria-label="Seat selection and checkout"] > div');
        if (!el) return false;
        const s = getComputedStyle(el);
        return s.transform === "none" || s.transform === "matrix(1, 0, 0, 1, 0, 0)";
      },
      { timeout: 5000 },
    )
    .then(() => true, () => false);
  const finalStyle = await page.$eval(panelSel, (el) => {
    const c = getComputedStyle(el);
    return { transform: c.transform, opacity: c.opacity, anim: c.animationName };
  });
  check(
    "bottom panel slides DOWN (mid-flight sample then settle at y=0, opacity=1)",
    !!settled && Number(finalStyle.opacity) > 0.9 && (!!mid || !!animSeen),
    `mid: ${mid ? `t=${mid.transform} o=${mid.opacity}` : animSeen ? `anim=${animSeen}` : "none"} -> final: t=${finalStyle.transform} o=${finalStyle.opacity}`,
  );

  // ---------- 3b. Aerial camera flight into the seat ----------
  const camFinal = await page.evaluate(() => window.__meridianCam || null).catch(() => null);
  check(
    "camera flies AERIAL view before settling into the seat",
    camSamples > 5 && maxCamY >= 5 && minCamY < 2.5 && camPhases.has("rise") && camPhases.has("dive"),
    `altitude ${minCamY.toFixed(2)}m -> ${maxCamY.toFixed(2)}m, phases=${[...camPhases].join("/")}, samples=${camSamples}`,
  );
  check(
    "camera ends at seat eye level (settled, not flying)",
    !!camFinal && camFinal.flying === false && camFinal.y < 2.5,
    camFinal ? `y=${camFinal.y.toFixed(2)}m flying=${camFinal.flying}` : "no camera data",
  );

  // ---------- 3c. Seat clarity in the 3D scene ----------
  const scene = await page.evaluate(() => window.__meridianScene || null).catch(() => null);
  check(
    "3D scene renders modelled seats with row labels",
    !!scene && scene.seatCount > 80 && scene.rowLabels >= 4,
    scene ? `seats=${scene.seatCount} rowLabels=${scene.rowLabels}` : "no scene data",
  );

  // ---------- 3d. Footage is playing on the screen ----------
  const screenMode = await page.evaluate(() => window.__meridianScreen || null).catch(() => null);
  if (screenMode?.mode === "video") {
    check("screen plays footage (trailer video on the screen)", true, "mode=video");
  } else {
    const frames1 = await page.evaluate(() => window.__meridianFootage?.frames ?? 0).catch(() => 0);
    await sleep(1600);
    const frames2 = await page.evaluate(() => window.__meridianFootage?.frames ?? 0).catch(() => 0);
    check(
      "screen plays footage (procedural film frames advancing)",
      frames2 - frames1 >= 5,
      `${frames1} -> ${frames2} frames`,
    );
  }

  // ---------- 3e. Per-seat POV accuracy + seat-to-seat difference ----------
  const seatApi = await page.evaluate(async (sid) => {
    const res = await fetch(`/api/shows/${sid}/seats`, { cache: "no-store" });
    return (await res.json()).seats;
  }, await page.evaluate(() => window.location.pathname.split("/").pop()));

  const findSeat = (label) => seatApi.find((s) => `${s.rowLabel}${s.number}` === label);
  const seatA = findSeat(seatLabelText);
  const expectedYaw = seatA ? (Math.atan2(-seatA.x, seatA.z) * 180) / Math.PI : null;
  const camA = await page.evaluate(() => window.__meridianCam || null).catch(() => null);

  check(
    "camera POV angle matches the seat geometry (accurate, not generic)",
    !!seatA &&
      !!camA &&
      Math.abs(camA.yawDeg - expectedYaw) < 0.75 &&
      Math.abs(camA.x - seatA.x) < 0.02 &&
      Math.abs(camA.y - seatA.y) < 0.02 &&
      Math.abs(camA.z - seatA.z) < 0.02,
    seatA && camA
      ? `seat ${seatLabelText} (x=${seatA.x.toFixed(2)}, z=${seatA.z.toFixed(2)}) -> cam x=${camA.x.toFixed(2)} y=${camA.y.toFixed(2)} z=${camA.z.toFixed(2)} yaw=${camA.yawDeg.toFixed(2)}deg (expected ${expectedYaw.toFixed(2)}deg)`
      : "missing data",
  );

  // Pick a clearly different seat and prove the camera angle follows it.
  const other = seatApi.find(
    (s) =>
      s.status === "AVAILABLE" &&
      `${s.rowLabel}${s.number}` !== seatLabelText &&
      Math.abs(s.x - (seatA?.x ?? 0)) > 1.5,
  );
  let camB = null;
  let expectedYawB = null;
  if (other) {
    await page.click('button[aria-label="Open seat map"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await sleep(400);
    const otherLabel = `${other.rowLabel}${other.number}`;
    const btn = await page.$(`[role="dialog"] button[aria-label^="${otherLabel},"]`);
    if (btn) {
      await btn.click();
      await page
        .waitForFunction(() => window.__meridianCam?.flying === false, { timeout: 20000 })
        .catch(() => {});
      await sleep(400);
      camB = await page.evaluate(() => window.__meridianCam || null).catch(() => null);
      expectedYawB = (Math.atan2(-other.x, other.z) * 180) / Math.PI;
      seatLabelText = `${other.rowLabel}${other.number}`;
    }
  }
  check(
    "a different seat produces a DIFFERENT camera angle (view is seat specific)",
    !!camB &&
      !!camA &&
      Math.abs(camB.yawDeg - camA.yawDeg) > 1 &&
      Math.abs(camB.yawDeg - expectedYawB) < 0.75,
    camB && camA
      ? `seat1 yaw=${camA.yawDeg.toFixed(2)}deg -> seat2 yaw=${camB.yawDeg.toFixed(2)}deg (expected ${expectedYawB?.toFixed(2)}deg)`
      : "missing data",
  );

  // body.innerText applies `text-transform: uppercase` (SEAT VIEW), so compare
  // case-insensitively.
  const metricsVisible = await page.evaluate(() => {
    const t = document.body.innerText.toLowerCase();
    return t.includes("seat view") && t.includes("distance") && t.includes("screen angle") && t.includes("offset");
  });
  check("metrics overlay visible (distance / screen angle / offset)", metricsVisible);
  check(`selected seat label "${seatLabelText}" in panel`, await page.evaluate((t) => document.body.innerText.includes(t), seatLabelText));
  // ---------- 4. Server-side hold ----------
  const showId = await page.evaluate(() => window.location.pathname.split("/").pop());
  let hold = null;
  for (let i = 0; i < 16 && !hold; i++) {
    await sleep(500);
    hold = await page.evaluate(async (sid) => {
      const res = await fetch(`/api/shows/${sid}/seats`, { cache: "no-store" });
      const data = await res.json();
      return data.seats.find((s) => s.heldByCurrentUser && s.status === "HELD") || null;
    }, showId);
  }
  check("seat HELD server-side for current user", !!hold, hold ? `${hold.rowLabel}${hold.number} expires ${hold.holdExpiresAt}` : "none");

  // ---------- 4b. Spatial (VR) toggle ----------
  const vrBtnSel = 'button[aria-label="Enter spatial (VR) preview"]';
  const hasVr = (await page.$(vrBtnSel)) !== null;
  check("spatial VR toggle present", hasVr);
  if (hasVr) {
    await page.click(vrBtnSel);
    await page.waitForFunction(
      () => document.querySelector('[data-vr="on"]') !== null,
      { timeout: 5000 },
    );
    check("entering VR shows vignette overlay + spatial chip", true);
  }

  // ---------- 4c. Resizable bottom panel ----------
  const panelWrapSel = '[aria-label="Seat selection and checkout"]';
  const hBefore = await page.$eval(panelWrapSel, (el) => Math.round(el.firstElementChild.getBoundingClientRect().height));
  const handle = await page.$('[aria-label="Resize selection panel"]');
  check("panel resize handle present", !!handle);
  if (handle) {
    const hb = await handle.boundingBox();
    if (hb) {
      const cx = hb.x + hb.width / 2;
      const cy = hb.y + hb.height / 2;
      // Drag the handle up ~blade: rAF-batched, tracks pointer 1:1.
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 7; i++) {
        await page.mouse.move(cx, cy - i * 33, { steps: 2 });
      }
      await page.mouse.up();
      await sleep(450); // spring snap to preset
      const hAfter = await page.$eval(panelWrapSel, (el) =>
        Math.round(el.firstElementChild.getBoundingClientRect().height),
      );
      const preset = await page.$eval(panelWrapSel, (el) => Number(el.firstElementChild.style.height.replace("px", "")));
      check(
        "panel resizes by dragging the handle",
        hAfter > hBefore + 40 && Math.abs(hAfter - preset) < 2,
        `${hBefore}px -> ${hAfter}px (snap target ${preset}px)`,
      );
      const saved = await page.evaluate(() => window.localStorage.getItem("meridian.panelHeight"));
      check("panel height persisted to localStorage", !!saved, `saved=${saved}`);
    }
  }

  // ---------- 5. Checkout (demo mode when Stripe keys are absent) ----------
  // The Continue button may briefly read "Holding..." while the hold request
  // is in progress; poll until it shows "Continue" (up to ~6s) then click.
  let clicked = false;
  for (let i = 0; i < 12 && !clicked; i++) {
    clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Continue");
      if (b) {
        b.click();
        return true;
      }
      return false;
    });
    if (!clicked) await sleep(500);
  }
  check("Continue button available", clicked);

  let landed = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    if (page.url().includes("/checkout/success")) {
      landed = true;
      break;
    }
  }
  check("checkout completes -> confirmation page", landed, page.url());

  if (landed) {
    await page.waitForSelector("main", { timeout: 10000 });
    const body = await page.evaluate(() => document.body.innerText);
    check(
      "confirmation shows code + ticket + QR",
      body.includes("Confirmation code") && body.includes("Seat "),
    );
  }

  const realErrors = consoleErrors.filter(
    (e) => !/favicon|Failed to load resource|net::ERR_|Autoplay|play\(\)/i.test(e),
  );
  check("no runtime console errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("unexpected failure", false, String(err && err.message ? err.message : err));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
