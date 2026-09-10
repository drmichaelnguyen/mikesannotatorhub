import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const actionContext = new AsyncLocalStorage<{ referenceId: string; actorId: string | null }>();

// Only identifiers and field names are recorded, never submitted text or file contents.
export function summarizeActionInput(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const summary = summarizeActionInput(Object.fromEntries(input.entries()));
    const caseIds = input.get("caseIds");
    if (typeof caseIds === "string") summary.caseCount = new Set(caseIds.split(/[\r\n,;\t]+/).map(id => id.trim()).filter(Boolean)).size;
    return summary;
  }
  if (!input || typeof input !== "object") return {};
  const row = input as Record<string, unknown>;
  const summary: Record<string, unknown> = { fields: Object.keys(row).filter(key => /^[a-zA-Z0-9_-]{1,100}$/.test(key)).sort().slice(0, 100) };
  for (const key of ["id", "caseDbId", "noteId", "guideId", "topicId", "annotatorUserId", "flagId"]) {
    if (typeof row[key] === "string") summary[key] = row[key].slice(0, 200);
  }
  if (Array.isArray(row.caseDbIds)) {
    summary.caseCount = row.caseDbIds.length;
    summary.caseDbIds = row.caseDbIds.filter((id): id is string => typeof id === "string").slice(0, 100).map(id => id.slice(0, 200));
  }
  if (row.patch && typeof row.patch === "object") summary.patchFields = Object.keys(row.patch).filter(key => /^[a-zA-Z0-9_-]{1,100}$/.test(key)).sort().slice(0, 100);
  return summary;
}

export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return /^[A-Z0-9_]{1,50}$/.test(error.code) ? error.code : "SERVER_ERROR";
  }
  if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) return error.message;
  return "SERVER_ERROR";
}

export async function writeActionLog(event: Record<string, unknown>) {
  const entry = JSON.stringify({ ...event, ...actionContext.getStore(), timestamp: new Date().toISOString() });
  try {
    const directory = process.env.ACTION_LOG_DIR || path.join(process.cwd(), "logs", "actions");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await appendFile(path.join(directory, `${new Date().toISOString().slice(0, 10)}.jsonl`), entry + "\n", { mode: 0o600 });
  } catch {
    // A logging outage must never turn a completed data change into a failed action.
    console.error("ACTION_LOG_WRITE_FAILED", entry);
  }
}

export async function runLoggedAction<T>(
  action: string,
  actorId: string | null,
  input: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const referenceId = actionContext.getStore()?.referenceId ?? randomUUID();
  return actionContext.run({ referenceId, actorId }, async () => {
    const started = Date.now();
    await writeActionLog({ action, outcome: "attempted", input: summarizeActionInput(input) });
    try {
      const result = await work();
      const rejected = result instanceof Response ? !result.ok : !!result && typeof result === "object" && "ok" in result && result.ok === false;
      const reason = result && typeof result === "object" && "error" in result ? result.error : undefined;
      await writeActionLog({ action, outcome: rejected ? "rejected" : "succeeded", reason, durationMs: Date.now() - started, ...(result instanceof Response ? { status: result.status } : {}) });
      return result;
    } catch (error) {
      // Next redirects are successful control flow; preserve the original exception.
      const redirect = error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT;");
      await writeActionLog({ action, outcome: redirect ? "redirected" : "failed", reason: redirect ? undefined : errorCode(error), durationMs: Date.now() - started });
      throw error;
    }
  });
}
