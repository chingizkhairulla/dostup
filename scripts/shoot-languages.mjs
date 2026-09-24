// Screenshots the real app in each language, so the English rollout can be
// judged on pixels rather than on passing jsdom tests — every layout defect in
// this project so far was invisible to component tests.
//
// Usage: node scripts/shoot-languages.mjs <outputDir> [url] [width] [height]

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9444;

const [outDir = ".", url = "http://localhost:8080/", width = "1280", height = "900"] =
  process.argv.slice(2);

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const page = (await res.json()).find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", fail, { once: true });
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

const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  "--remote-allow-origins=*",
  "--no-first-run",
  "--user-data-dir=" + process.env.TEMP + "\\lang-shots-profile",
  "about:blank",
]);
chrome.stderr.on("data", () => {});

for (let i = 0; i < 40; i += 1) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`);
    break;
  } catch {
    await delay(250);
  }
}

const { send, close } = await connect();
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: Number(width) < 640,
});

mkdirSync(outDir, { recursive: true });

for (const language of ["ru", "kk", "en"]) {
  // Set the stored language, then load the app so it starts in it.
  await send("Page.navigate", { url });
  await delay(1200);
  await send("Runtime.evaluate", {
    expression: `localStorage.setItem("language", ${JSON.stringify(language)})`,
  });
  await send("Page.reload");
  await delay(3500);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const file = join(outDir, `app-${language}-${width}.png`);
  writeFileSync(file, Buffer.from(shot.data, "base64"));

  const probe = await send("Runtime.evaluate", {
    expression: `JSON.stringify({
      lang: document.documentElement.lang,
      toggle: [...document.querySelectorAll('[role=group] button')].map(b => b.textContent),
      headings: [...document.querySelectorAll('h1,h2')].slice(0, 4).map(h => h.textContent.trim()),
      overflowing: [...document.querySelectorAll('button, a')]
        .filter(el => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
        .slice(0, 6)
        .map(el => el.textContent.trim().slice(0, 40)),
    })`,
    returnByValue: true,
  });
  console.log(`\n=== ${language} ===\n${file}\n${probe.result.value}`);
}

close();
chrome.kill();
