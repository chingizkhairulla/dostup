// Looks at the seller screens in a real browser, in every language and at
// desktop and phone width, and reports what a reader would actually notice:
//
//   - Cyrillic on an English screen (the text is read off the rendered page,
//     so it also catches what no source scan can: text built at run time,
//     dates, anything inherited from data)
//   - Russian on a Kazakh screen where the Kazakh exists (the text equals the
//     ru slot of a phrase, or of a t() entry, whose kk differs)
//   - a control whose text no longer fits (English runs longer than Russian)
//   - the page scrolling sideways
//   - a screen that fails to render at all
//
// jsdom has no layout engine, so none of this is visible to the unit tests.
//
// Usage:
//   npx vite --config scripts/language-harness/vite.config.mts     (in one terminal)
//   node scripts/audit-languages.mjs [outputDir] [--scene <name>]  (in another)
//
// Exits 1 when an English screen shows Cyrillic, a screen crashes, or the page
// scrolls sideways. Clipped controls are listed for a person to judge: some
// are cut on purpose (an ellipsis on a long file name).

import { launchChrome } from "./chrome.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { sourceFiles } from "./i18n-raw.mjs";

/**
 * Russian texts that have a different Kazakh: the ru slot of every phrase and
 * of every t() entry whose kk is not the same. Seen on a Kazakh screen, one of
 * these means the Russian was shown although the Kazakh exists.
 */
function russianWithKazakh() {
  const found = new Set();
  for (const file of sourceFiles("src")) {
    const source = readFileSync(file, "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const slot = (name) => node.properties.find((p) => ts.isPropertyAssignment(p) && p.name?.getText(tree) === name)?.initializer;
        const [ru, kk] = [slot("ru"), slot("kk")];
        if (ru && kk && ts.isStringLiteralLike(ru) && ts.isStringLiteralLike(kk) && ru.text !== kk.text) found.add(ru.text.trim());
        if (ru && kk && ts.isObjectLiteralExpression(ru) && ts.isObjectLiteralExpression(kk)) {
          const kazakh = new Map(kk.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText(tree), p.initializer]));
          for (const p of ru.properties.filter(ts.isPropertyAssignment)) {
            const k = kazakh.get(p.name.getText(tree));
            if (k && ts.isStringLiteralLike(p.initializer) && ts.isStringLiteralLike(k) && p.initializer.text !== k.text && !p.initializer.text.includes("{")) {
              found.add(p.initializer.text.trim());
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  return [...found].filter((text) => /[А-Яа-яЁё]{3,}/.test(text));
}

const RUSSIAN_WITH_KAZAKH = russianWithKazakh();

const HARNESS = "http://localhost:5198";
const PORT = 9555;

const args = process.argv.slice(2);
const onlyScene = args.includes("--scene") ? args[args.indexOf("--scene") + 1] : null;
const outDir = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--scene") ?? null;

const LANGUAGES = ["ru", "kk", "en"];
const WIDTHS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
];

// Clicks that open what a scene hides by default. Each is a list of
// expressions evaluated in the page; a click that finds nothing is reported.
const clickButton = (labels) => `(() => {
  const labels = ${JSON.stringify(labels)};
  const button = [...document.querySelectorAll("button")].find((el) =>
    labels.some((label) => el.textContent.trim().startsWith(label)) && el.offsetParent !== null);
  if (!button) return "no button: " + labels.join(" / ");
  button.click();
  return "ok";
})()`;

// For controls that are not <button>s (the Free / Paid cards): clicks the
// element whose whole text is the label, and lets the click bubble.
const clickText = (labels) => `(() => {
  const labels = ${JSON.stringify(labels)};
  const leaf = [...document.querySelectorAll("p, span, div, label, button")].find((el) =>
    el.children.length === 0 && labels.includes(el.textContent.trim()) && el.offsetParent !== null);
  if (!leaf) return "no text: " + labels.join(" / ");
  leaf.click();
  return "ok";
})()`;

// Brings a part of a long form into the screenshot.
const scrollTo = (labels) => `(() => {
  const labels = ${JSON.stringify(labels)};
  const leaf = [...document.querySelectorAll("p, span, div, label, button")].find((el) =>
    el.children.length === 0 && labels.includes(el.textContent.trim()) && el.offsetParent !== null);
  if (!leaf) return "nothing to scroll to: " + labels.join(" / ");
  leaf.scrollIntoView({ block: "start" });
  return "ok";
})()`;

// Opens every collapsed section (but not a select, which is also "collapsed").
const expandAll = `(() => {
  const triggers = [...document.querySelectorAll('[aria-expanded="false"]')]
    .filter((el) => el.getAttribute("role") !== "combobox" && el.offsetParent !== null);
  triggers.forEach((el) => el.click());
  return "ok";
})()`;

const SCENES = [
  {
    name: "editor",
    steps: [clickButton(["Создать", "Create", "Құру", "Жасау", "Өнім қосу", "Добавить", "Add", "Қосу"]), expandAll, clickText(["Платно", "Ақылы", "Paid"]), expandAll, clickText(["Регулярно", "Тұрақты", "Recurring"]), expandAll],
  },
  {
    // The same form, scrolled to its payment section — the densest part.
    name: "editor",
    shot: "editor-payment",
    steps: [
      clickButton(["Создать", "Create", "Құру", "Жасау", "Өнім қосу", "Добавить", "Add", "Қосу"]),
      expandAll,
      clickText(["Платно", "Ақылы", "Paid"]),
      expandAll,
      clickText(["Регулярно", "Тұрақты", "Recurring"]),
      expandAll,
      scrollTo(["Оплата", "Төлем", "Payment"]),
    ],
  },
  { name: "materials-tab", steps: [] },
  { name: "materials", steps: [] },
  { name: "materials-add", steps: [] },
  { name: "announcements", steps: [] },
  { name: "users", steps: [] },
  { name: "schedule", steps: [] },
  { name: "wizard", steps: [] },
  { name: "cover", steps: [] },
  { name: "settings", steps: [] },
  { name: "reminders", steps: [] },
  { name: "account-sheet", steps: [] },
  { name: "not-found", steps: [] },
  { name: "seller-notifications", steps: [] },
  { name: "pending-payments", steps: [] },
  { name: "teacher-schedule", steps: [] },
  { name: "teacher-notifications", steps: [] },
  { name: "teacher-materials", steps: [] },
  { name: "buyer-home", steps: [] },
  { name: "buyer-schedule", steps: [] },
  { name: "buyer-materials", steps: [] },
  { name: "buyer-notifications", steps: [] },
].filter((scene) => !onlyScene || scene.name === onlyScene || scene.shot === onlyScene);

// Read off the rendered page. Text inside the fake data is Latin, so Cyrillic
// here is the interface's own.
const PROBE = `(() => {
  const CYRILLIC = /[\\u0400-\\u04FF]/;
  const RUSSIAN_WITH_KAZAKH = new Set(${JSON.stringify(RUSSIAN_WITH_KAZAKH)});
  const russianShown = new Set();
  const visible = (el) => {
    if (!el) return false;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  const cyrillic = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode()); ) {
    const text = node.textContent.trim();
    if (text && CYRILLIC.test(text) && visible(node.parentElement)) cyrillic.add(text.slice(0, 90));
    if (text && RUSSIAN_WITH_KAZAKH.has(text) && visible(node.parentElement)) russianShown.add(text.slice(0, 90));
  }
  for (const el of document.querySelectorAll("[placeholder],[title],[aria-label],[alt]")) {
    for (const name of ["placeholder", "title", "aria-label", "alt"]) {
      const value = el.getAttribute(name);
      if (value && CYRILLIC.test(value) && visible(el)) cyrillic.add("@" + name + ": " + value.slice(0, 90));
    }
  }

  const clipped = [];
  for (const el of document.querySelectorAll("button, a, label, [role=tab], h1, h2, h3, th")) {
    if (!visible(el) || el.scrollWidth <= el.clientWidth + 2) continue;
    // For screen readers only, by design: Tailwind's sr-only and Radix's
    // VisuallyHidden both clip to nothing. Judged by the clip, not by width:
    // a button squeezed to 2px by its row is exactly what should be reported.
    const hiddenForScreenReaders = (node) => {
      for (let current = node; current && current !== document.body; current = current.parentElement) {
        if (current.classList.contains("sr-only")) return true;
        if (getComputedStyle(current).clip === "rect(0px, 0px, 0px, 0px)") return true;
      }
      return false;
    };
    if (hiddenForScreenReaders(el)) continue;
    const style = getComputedStyle(el);
    const deliberate = style.textOverflow === "ellipsis" || el.classList.contains("truncate") || !!el.querySelector(".truncate");
    clipped.push((deliberate ? "(ellipsis) " : "") + el.textContent.trim().replace(/\\s+/g, " ").slice(0, 60));
  }

  // A button its row has squeezed narrower than any icon or word: its content
  // shrinks with it, so the overflow test above cannot see it.
  for (const el of document.querySelectorAll("button")) {
    const box = el.getBoundingClientRect();
    const hasContent = el.textContent.trim() || el.querySelector("svg");
    // Narrower than tall: a square 16px checkbox or close cross is drawn that way on purpose.
    if (box.height > 0 && box.width > 0 && box.width < 20 && box.width < box.height * 0.75 && hasContent) {
      clipped.push("(squeezed to " + Math.round(box.width) + "px) " + (el.getAttribute("aria-label") || el.textContent.trim() || "icon button"));
    }
  }

  const crash = document.querySelector("#harness-error");
  return JSON.stringify({
    lang: document.documentElement.lang,
    crashed: crash ? crash.textContent.slice(0, 300) : null,
    empty: document.querySelector("#harness-scene")?.textContent.trim().length === 0 && document.body.textContent.trim().length < 5,
    cyrillic: [...cyrillic],
    russianShown: [...russianShown],
    clipped: [...new Set(clipped)],
    sideways: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    characters: document.body.innerText.length,
  });
})()`;

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find((target) => target.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", fail, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled") {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
      consoleLines.push(`${message.params.type}: ${text}`);
    }
    if (message.method === "Runtime.exceptionThrown") {
      consoleLines.push(`exception: ${message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text}`);
    }
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
  return { send, close: () => ws.close(), consoleLines };
}

try {
  await fetch(HARNESS);
} catch {
  console.error(`The harness is not running on ${HARNESS}.\nStart it first: npm run harness:languages`);
  process.exit(2);
}

const chrome = await launchChrome(PORT);

const { send, close, consoleLines } = await connect();
await send("Page.enable");
await send("Runtime.enable");
if (outDir) mkdirSync(outDir, { recursive: true });

const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

const problems = [];
const rows = [];

for (const scene of SCENES) {
  for (const { width, height } of WIDTHS) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 640 });

    for (const language of LANGUAGES) {
      consoleLines.length = 0;
      await send("Page.navigate", { url: `${HARNESS}/?scene=${scene.name}&lang=${language}` });
      // Wait for the scene to have something in it (the first load of a scene
      // also waits for Vite to compile it), then let queries settle.
      for (let waited = 0; waited < 15000; waited += 300) {
        await delay(300);
        // The old page can still be there right after navigating: check it is the new one.
        const ready = await evaluate(`location.search.includes("lang=${language}") && document.documentElement.lang === "${language}" && ((document.querySelector("#harness-scene")?.innerText.trim().length ?? 0) > 0 || !!document.querySelector("#harness-error") || document.body.innerText.trim().length > 20)`);
        if (ready) break;
      }
      await delay(1200);

      const stepNotes = [];
      for (const step of scene.steps) {
        const outcome = await evaluate(step);
        if (outcome !== "ok") stepNotes.push(outcome);
        await delay(700);
      }

      const probe = JSON.parse(await evaluate(PROBE));
      const where = `${scene.shot ?? scene.name} · ${language} · ${width}px`;

      if (outDir) {
        const shot = await send("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(outDir, `${scene.shot ?? scene.name}-${language}-${width}.png`), Buffer.from(shot.data, "base64"));
      }

      const exceptions = consoleLines.filter((line) => line.startsWith("exception:"));
      const unanswered = [...new Set(consoleLines.filter((line) => line.includes("[harness] unanswered")).map((line) => line.replace(/^.*unanswered: /, "")))];

      if (probe.crashed) problems.push(`${where}: crashed — ${probe.crashed.split("\n")[0]}`);
      if (exceptions.length) problems.push(`${where}: ${exceptions[0].slice(0, 200)}`);
      if (probe.lang !== language) problems.push(`${where}: <html lang> is "${probe.lang}"`);
      if (probe.characters < 20) problems.push(`${where}: the screen is empty`);
      if (probe.sideways > 0) problems.push(`${where}: page scrolls sideways by ${probe.sideways}px`);
      if (language === "kk" && probe.russianShown.length) {
        problems.push(`${where}: Russian on a Kazakh screen where Kazakh exists — ${probe.russianShown.join(" | ")}`);
      }
      if (language === "en" && probe.cyrillic.length) {
        problems.push(`${where}: Cyrillic on an English screen — ${probe.cyrillic.join(" | ")}`);
      }
      for (const note of stepNotes) problems.push(`${where}: ${note}`);

      rows.push({ where, clipped: probe.clipped, unanswered, characters: probe.characters });
    }
  }
}

close();
chrome.close();

for (const row of rows) {
  const hard = row.clipped.filter((text) => !text.startsWith("(ellipsis)"));
  const notes = [];
  if (hard.length) notes.push(`does not fit: ${hard.join(" | ")}`);
  if (row.unanswered.length) notes.push(`unanswered: ${row.unanswered.join(", ")}`);
  console.log(`${row.where.padEnd(34)} ${String(row.characters).padStart(5)} chars${notes.length ? "   " + notes.join("   ") : ""}`);
}

console.log(`\n${rows.length} screens checked (${SCENES.length} scenes × ${WIDTHS.length} widths × ${LANGUAGES.length} languages)`);
if (problems.length) {
  console.log(`\n${problems.length} problems:`);
  for (const problem of problems) console.log("  " + problem);
  process.exit(1);
}
console.log("No Cyrillic on English screens, no Russian on Kazakh screens where Kazakh exists, no crashes, no sideways scrolling.");
