import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBatchCutoffs, resolveBatchPayChanges } from "../src/lib/batch-case-edit";

test("batch edits preserve different existing dates and review amounts by default", () => {
  const cutoffs = resolveBatchCutoffs(null, null);
  const pay = resolveBatchPayChanges(null, null);
  assert.ok(cutoffs.ok && pay.ok);
  const cases = [
    { deadline: "2026-10-01", fiveStarBonusPercent: 0, annotatorBonus: -10 },
    { deadline: "2026-10-04", fiveStarBonusPercent: 25, annotatorBonus: 15 },
  ];
  assert.deepEqual(cases.map(row => ({ ...row, ...cutoffs.data, ...pay.data })), cases);
});

test("changing the five-star percentage leaves approved money alone and supports zero", () => {
  for (const percent of [0, 12.5, 100]) {
    const result = resolveBatchPayChanges(percent, null);
    assert.ok(result.ok);
    assert.deepEqual({ annotatorBonus: -5, ...result.data }, { annotatorBonus: -5, fiveStarBonusPercent: percent });
  }
  assert.deepEqual(resolveBatchPayChanges(null, -10), { ok: true, data: { annotatorBonus: -10 } });
});

test("invalid percentages and non-finite review amounts are rejected before updating", () => {
  for (const percent of [-1, 100.01, 1.234, NaN, Infinity]) assert.deepEqual(resolveBatchPayChanges(percent, null), { ok: false, error: "quality_bonus" });
  assert.deepEqual(resolveBatchPayChanges(null, NaN), { ok: false, error: "invalid_amount" });
});

test("replacement cutoffs require a complete valid pair and expiry after deadline", () => {
  const deadline = "2026-10-01T12:00:00.000Z";
  const expiresAt = "2026-10-01T20:00:00.000Z";
  assert.deepEqual(resolveBatchCutoffs(deadline, expiresAt), { ok: true, data: { deadline: new Date(deadline), expiresAt: new Date(expiresAt) } });
  assert.deepEqual(resolveBatchCutoffs(null, expiresAt), { ok: false, error: "deadline" });
  assert.deepEqual(resolveBatchCutoffs(deadline, null), { ok: false, error: "expiry" });
  assert.deepEqual(resolveBatchCutoffs("invalid", expiresAt), { ok: false, error: "deadline" });
  assert.deepEqual(resolveBatchCutoffs(deadline, deadline), { ok: false, error: "expiry" });
  assert.deepEqual(resolveBatchCutoffs(expiresAt, deadline), { ok: false, error: "expiry" });
});
