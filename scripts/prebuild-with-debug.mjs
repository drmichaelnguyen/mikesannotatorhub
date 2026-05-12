import { existsSync, rmSync } from "node:fs";

const ENDPOINT = "http://127.0.0.1:7876/ingest/c965d08a-4048-4249-a2d7-84bd9fc45517";
const runId = `prebuild-${Date.now()}`;

function log(hypothesisId, location, message, data = {}) {
  // #region agent log
  fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4027ed'},body:JSON.stringify({sessionId:'4027ed',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

log("H1", "scripts/prebuild-with-debug.mjs:before", "prebuild about to remove .next", {
  pid: process.pid,
  cwd: process.cwd(),
  nextExistsBefore: existsSync(".next"),
  npmLifecycleEvent: process.env.npm_lifecycle_event ?? null,
});

rmSync(".next", { recursive: true, force: true });

log("H1", "scripts/prebuild-with-debug.mjs:after", "prebuild removed .next", {
  nextExistsAfter: existsSync(".next"),
});
