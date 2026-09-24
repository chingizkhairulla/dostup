// Runtime audit for the customer's rule: text on an orange background must be
// white. Static class reading cannot see inherited colour — an element with an
// orange background and no colour of its own takes the page's dark text — so
// this drives real Chrome and reads computed styles.
//
// Usage: node scripts/audit-orange.mjs [--keep-open]
// Expects the harness dev server on http://localhost:5199 (see README note in
// scripts/orange-harness/vite.config.mts).

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HARNESS = "http://localhost:5199";
const PORT = 9333;

/** Scenes to visit, with the viewport each one needs. */
const SCENES = [
  { name: "menus", width: 1280, height: 900 },
  { name: "controls", width: 1280, height: 900 },
  { name: "calendar", width: 1280, height: 900 },
  // The dialog's close button is phone-only (sm:hidden).
  { name: "dialog", width: 390, height: 844 },
];

async function cdp() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { send, close: () => ws.close() };
}

/** Runs in the page: finds orange surfaces and reports the colour of their text. */
const SCAN = `(() => {
  const parse = (value) => {
    const m = value.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const [r, g, b, a = "1"] = m[1].split(",").map((p) => parseFloat(p));
    return { r, g, b, a };
  };

  const hsl = ({ r, g, b }) => {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return { h: 0, s: 0, l };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return { h: (h * 60 + 360) % 360, s, l };
  };

  const luminance = ({ r, g, b }) => {
    const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };

  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const isOrange = (c) => {
    if (!c || c.a < 0.9) return false;
    const { h, s, l } = hsl(c);
    return h >= 10 && h <= 40 && s > 0.6 && l > 0.25 && l < 0.75;
  };

  const hasOwnText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className : "";
    return el.tagName.toLowerCase()
      + (el.dataset.scan ? "[data-scan=" + el.dataset.scan + "]" : "")
      + (cls ? "." + cls.trim().split(/\\s+/).slice(0, 4).join(".") : "");
  };

  const findings = [];
  for (const el of document.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    const bg = parse(style.backgroundColor);
    const gradient = /linear-gradient/.test(style.backgroundImage);
    if (!isOrange(bg) && !gradient) continue;
    if (gradient && !/rgb\\(2[0-9][0-9]|rgb\\(1[5-9][0-9]/.test(style.backgroundImage)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    // Report the element's own text, and any descendant that paints text
    // directly on this surface without repainting the background.
    const targets = [];
    if (hasOwnText(el)) targets.push(el);
    for (const child of el.querySelectorAll("*")) {
      if (!hasOwnText(child)) continue;
      const childBg = parse(getComputedStyle(child).backgroundColor);
      if (childBg && childBg.a > 0.9) continue; // paints its own surface
      targets.push(child);
    }

    for (const target of targets) {
      const fg = parse(getComputedStyle(target).color);
      if (!fg) continue;
      const surface = gradient ? { r: 249, g: 112, b: 21, a: 1 } : bg;
      findings.push({
        element: describe(target),
        within: target === el ? null : describe(el),
        color: style.backgroundColor + (gradient ? " (gradient)" : ""),
        text: getComputedStyle(target).color,
        textIsWhite: luminance(fg) > 0.85,
        contrast: Number(contrast(fg, surface).toFixed(2)),
        sample: (target.textContent || "").trim().slice(0, 40),
      });
    }
  }
  return findings;
})()`;

async function run() {
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + process.env.TEMP + "\\orange-audit-profile",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => {});

  // Wait for the debugging endpoint.
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch {
      await delay(250);
    }
  }

  const { send, close } = await cdp();
  await send("Page.enable");
  await send("Runtime.enable");

  const report = [];
  for (const scene of SCENES) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: scene.width,
      height: scene.height,
      deviceScaleFactor: 1,
      mobile: scene.width < 640,
    });
    await send("Page.navigate", { url: `${HARNESS}/?scene=${scene.name}` });
    await delay(1500);

    // Focus each menu item in turn so the `focus:` states are real.
    const focusables = await send("Runtime.evaluate", {
      expression: `[...document.querySelectorAll("[data-scan]")].map(el => el.dataset.scan)`,
      returnByValue: true,
    });

    const sceneFindings = new Map();
    const collect = async () => {
      const { result } = await send("Runtime.evaluate", { expression: SCAN, returnByValue: true });
      for (const finding of result.value ?? []) {
        sceneFindings.set(finding.element + "|" + finding.sample, finding);
      }
    };

    await collect();
    for (const name of focusables.result.value ?? []) {
      await send("Runtime.evaluate", {
        expression: `document.querySelector('[data-scan="${name}"]')?.focus()`,
      });
      await delay(80);
      await collect();
    }

    report.push({ scene: scene.name, findings: [...sceneFindings.values()] });
  }

  close();
  chrome.kill();

  let failures = 0;
  for (const { scene, findings } of report) {
    console.log(`\n=== scene: ${scene} — ${findings.length} orange surface(s) with text ===`);
    for (const f of findings) {
      const verdict = f.textIsWhite ? "OK   " : "DARK ";
      if (!f.textIsWhite) failures += 1;
      console.log(
        `  ${verdict} ${f.element}${f.within ? ` (inside ${f.within})` : ""}\n` +
          `        bg=${f.color} text=${f.text} contrast=${f.contrast}:1 "${f.sample}"`,
      );
    }
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} element(s) with non-white text on orange`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(2);
});
