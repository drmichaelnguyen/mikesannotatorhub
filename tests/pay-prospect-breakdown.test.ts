import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCasePayProspect, computeCompensation, suggestedQualityAdjustment } from "../src/lib/compensation";

test("maximum pay separately explains base, tapered overtime, urgency and project quality", () => {
  const p = buildCasePayProspect("PER_MINUTE", 2, 10, 20, { rushPercent: 10, fiveStarBonusPercent: 25 });
  assert.equal(p.optimalMinutes, 15);
  assert.equal(p.basePayBeforeRush, 30);
  assert.equal(p.maximumOvertimeMinutes, 5);
  assert.equal(p.maximumOvertimePayBeforeRush, 5);
  assert.equal(p.maximumRushBonus, 3.5);
  assert.equal(p.minimumCasePay, 33);
  assert.equal(p.fiveStarQualityBonus, 8.25);
  assert.equal(p.resubmitDeduction, 0);
  assert.equal(p.maximumPotentialPay, 46.75);
});

test("flat cases and zero time spans earn no extra-time bonus", () => {
  const flat = buildCasePayProspect("PER_CASE", 100, 10, 20, { rushPercent: 10, fiveStarBonusPercent: 25 });
  assert.equal(flat.maximumOvertimeMinutes, 0);
  assert.equal(flat.maximumOvertimePayBeforeRush, 0);
  assert.equal(flat.maximumRushBonus, 10);
  assert.equal(flat.fiveStarQualityBonus, 27.5);
  assert.equal(flat.maximumPotentialPay, 137.5);
  const noSpan = buildCasePayProspect("PER_MINUTE", 2, 10, 10);
  assert.equal(noSpan.maximumOvertimePayBeforeRush, 0);
});

test("resubmission deduction remains visible independently of a zero quality bonus", () => {
  const p = buildCasePayProspect("PER_CASE", 100, 10, 20, { fiveStarBonusPercent: 0, wasResubmitted: true });
  assert.equal(p.fiveStarQualityBonus, 0);
  assert.equal(p.resubmitDeduction, 10);
  assert.equal(p.maximumPotentialPay, 90);
});

test("displayed components reconcile to actual maximum payout including cent rounding", () => {
  for (const type of ["PER_CASE", "PER_MINUTE"] as const) {
    for (const amount of [0, 0.01, 0.05, 1.27, 2, 123.45]) {
      for (const fiveStarBonusPercent of [0, 12.5, 15, 100]) {
        for (const rushPercent of [0, 5, 10, 15]) {
          for (const wasResubmitted of [false, true]) {
            const p = buildCasePayProspect(type, amount, 10, 21, { fiveStarBonusPercent, rushPercent, wasResubmitted });
            const cents = (value: number) => Math.round(value * 100);
            assert.equal(
              cents(p.basePayBeforeRush) + cents(p.maximumOvertimePayBeforeRush) + cents(p.maximumRushBonus) + cents(p.fiveStarQualityBonus) - cents(p.resubmitDeduction) + cents(p.roundingAdjustment),
              cents(p.maximumPotentialPay),
            );
            const bonus = suggestedQualityAdjustment(5, p.minimumCasePay, { fiveStarBonusPercent, wasResubmitted });
            assert.equal(p.maximumPotentialPay, computeCompensation(type, amount, 21, 21, 10, bonus, rushPercent));
          }
        }
      }
    }
  }
});
