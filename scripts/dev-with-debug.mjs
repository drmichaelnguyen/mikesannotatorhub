import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const ENDPOINT = "http://127.0.0.1:7876/ingest/c965d08a-4048-4249-a2d7-84bd9fc45517";
const runId = `dev-${Date.now()}`;

function log(hypothesisId, location, message, data = {}) {
  // #region agent log
  fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4027ed'},body:JSON.stringify({sessionId:'4027ed',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

const devDir = ".next/static/development";
log("H1", "scripts/dev-with-debug.mjs:start", "dev launcher start", {
  pid: process.pid,
  cwd: process.cwd(),
  devDirExistsAtStart: existsSync(devDir),
  npmLifecycleEvent: process.env.npm_lifecycle_event ?? null,
});

let lastExists = existsSync(devDir);
setInterval(() => {
  const nowExists = existsSync(devDir);
  if (nowExists !== lastExists) {
    log("H2", "scripts/dev-with-debug.mjs:watch", "dev dir existence changed", {
      from: lastExists,
      to: nowExists,
      devDir,
      pid: process.pid,
    });
    lastExists = nowExists;
  }
}, 1000).unref();

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "--turbopack", "-p", "3300"],
  { stdio: "inherit", env: process.env },
);

log("H3", "scripts/dev-with-debug.mjs:spawn", "spawned next dev", { childPid: child.pid ?? null });

child.on("exit", (code, signal) => {
  log("H3", "scripts/dev-with-debug.mjs:exit", "next dev exited", {
    code,
    signal,
    devDirExistsAtExit: existsSync(devDir),
  });
  process.exit(code ?? 0);
});
