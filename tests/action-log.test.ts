import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { actionContext, runLoggedAction, summarizeActionInput } from "../src/lib/action-log";

test("logs retain attempts, failures and independent actor references without submitted contents", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "action-log-test-"));
  const previous = process.env.ACTION_LOG_DIR;
  process.env.ACTION_LOG_DIR = directory;
  try {
    const secret = "private clinical content and password";
    await Promise.all([
      runLoggedAction("updateCase", "reviewer-a", { caseDbId: "case-a", content: secret }, async () => {
        await new Promise(resolve => setTimeout(resolve, 15));
        assert.equal(actionContext.getStore()?.actorId, "reviewer-a");
        return { ok: true };
      }),
      runLoggedAction("createCase", "reviewer-b", { password: secret }, async () => ({ ok: false, error: "instructions" })),
    ]);
    await assert.rejects(runLoggedAction("deleteCase", "reviewer-c", {}, async () => { throw new Error(secret); }));
    const raw = await readFile(path.join(directory, `${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8");
    assert.ok(!raw.includes(secret));
    const events = raw.trim().split("\n").map(line => JSON.parse(line));
    for (const [action, outcome, actor] of [["updateCase", "succeeded", "reviewer-a"], ["createCase", "rejected", "reviewer-b"], ["deleteCase", "failed", "reviewer-c"]]) {
      const group = events.filter(e => e.action === action);
      assert.deepEqual(group.map(e => e.outcome), ["attempted", outcome]);
      assert.ok(group.every(e => e.actorId === actor && e.referenceId === group[0].referenceId));
    }
    assert.equal(new Set(events.map(e => e.referenceId)).size, 3);
  } finally {
    if (previous === undefined) delete process.env.ACTION_LOG_DIR; else process.env.ACTION_LOG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("logging storage failure does not turn a successful mutation into a failure", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "action-log-failure-"));
  const previous = process.env.ACTION_LOG_DIR;
  const originalError = console.error;
  const failures: unknown[] = [];
  try {
    const file = path.join(directory, "not-a-directory");
    await writeFile(file, "");
    process.env.ACTION_LOG_DIR = file;
    console.error = (...args) => { failures.push(args); };
    assert.deepEqual(await runLoggedAction("save", "actor", {}, async () => ({ ok: true })), { ok: true });
    assert.equal(failures.length, 2);
  } finally {
    console.error = originalError;
    if (previous === undefined) delete process.env.ACTION_LOG_DIR; else process.env.ACTION_LOG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("form summaries omit passwords, text and uploaded contents", () => {
  const data = new FormData();
  data.set("password", "secret");
  data.set("guideline", "private content");
  data.set("continuityReports", new Blob(["private report"]), "patient-name.html");
  assert.deepEqual(summarizeActionInput(data), { fields: ["continuityReports", "guideline", "password"] });
});

test("nested operations retain correlation and redirects preserve control flow", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "action-log-nested-"));
  const previous = process.env.ACTION_LOG_DIR;
  process.env.ACTION_LOG_DIR = directory;
  try {
    const redirect = Object.assign(new Error("redirect"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    await assert.rejects(runLoggedAction("logout", "actor", {}, async () => {
      await runLoggedAction("clearSession", "actor", {}, async () => ({ ok: true }));
      throw redirect;
    }), error => error === redirect);
    const raw = await readFile(path.join(directory, `${new Date().toISOString().slice(0, 10)}.jsonl`), "utf8");
    const events = raw.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(new Set(events.map(e => e.referenceId)).size, 1);
    assert.equal(events.at(-1).outcome, "redirected");
  } finally {
    if (previous === undefined) delete process.env.ACTION_LOG_DIR; else process.env.ACTION_LOG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
