// Starts a headless Chrome for the audit scripts and stops all of it again.
//
// `child.kill()` on Windows ends only the parent process; Chrome's own
// children kept running and kept the debugging port. The next run then
// connected to that old browser instead of its own, and read pages from a
// previous run. So: refuse a port that is already taken, use a fresh profile
// every time, and end the whole process tree.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function answers(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

export async function launchChrome(port) {
  if (await answers(port)) {
    throw new Error(
      `Something already listens on port ${port} — most likely a Chrome left over from an earlier run. ` +
        `Close it first (Task Manager, or: Get-NetTCPConnection -LocalPort ${port} | Stop-Process -Id {$_.OwningProcess}).`,
    );
  }

  const profile = mkdtempSync(join(tmpdir(), "audit-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "about:blank",
  ]);
  chrome.stderr.on("data", () => {});

  for (let attempt = 0; attempt < 40 && !(await answers(port)); attempt += 1) await delay(250);

  const close = () => {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    else chrome.kill("SIGKILL");
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Windows may hold a file a moment longer; a temp folder is harmless.
    }
  };
  return { close };
}
