import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCasePayProspect, computeCompensation, suggestedQualityAdjustment } from "../src/lib/compensation";
import { isValidFiveStarBonusPercent, resolveFiveStarBonusPercent } from "../src/lib/project-quality-bonus";

test("five-star bonuses support defaults, disabling, fractional percentages and rounding", () => {
  assert.equal(suggestedQualityAdjustment(5, 100), 15);
  assert.equal(suggestedQualityAdjustment(5, 100, { fiveStarBonusPercent: 0 }), 0);
  assert.equal(suggestedQualityAdjustment(5, 100, { fiveStarBonusPercent: 25 }), 25);
  assert.equal(suggestedQualityAdjustment(5, 123.45, { fiveStarBonusPercent: 12.5 }), 15.43);
  assert.equal(suggestedQualityAdjustment(5, 100, { fiveStarBonusPercent: 100 }), 100);
});

test("project setting affects only five-star quality, preserving resubmit deductions", () => {
  for (const percent of [0, 15, 50, 100]) {
    for (const [rating, amount] of [[4, 0], [3, -10], [2, -25], [1, -40]]) {
      assert.equal(suggestedQualityAdjustment(rating, 100, { fiveStarBonusPercent: percent }), amount);
    }
  }
  assert.equal(suggestedQualityAdjustment(5, 100, { fiveStarBonusPercent: 25, wasResubmitted: true, at: "2026-09-09" }), 15);
  assert.equal(suggestedQualityAdjustment(5, 100, { fiveStarBonusPercent: 0, wasResubmitted: true, at: "2026-09-09" }), -10);
});

test("annotator pay prospects use the selected percentage for both pay types", () => {
  assert.equal(buildCasePayProspect("PER_CASE", 100, 10, 20, { fiveStarBonusPercent: 25 }).maximumPotentialPay, 125);
  const disabled = buildCasePayProspect("PER_MINUTE", 2, 10, 20, { fiveStarBonusPercent: 0 });
  const bonus = buildCasePayProspect("PER_MINUTE", 2, 10, 20, { fiveStarBonusPercent: 25 });
  assert.equal(disabled.maximumPotentialPay, disabled.maximumTimePay);
  assert.equal(bonus.maximumPotentialPay - disabled.maximumPotentialPay, 7.5);
  // Final payout continues to use its stored bonus, irrespective of new project suggestions.
  assert.equal(computeCompensation("PER_CASE", 100, 10, 20, 10, 15), 115);
});

test("reject invalid percentages and preserve an explicit zero", () => {
  for (const value of [-1, 100.01, Infinity, NaN, 12.345]) assert.equal(isValidFiveStarBonusPercent(value), false);
  for (const value of [0, 0.01, 12.5, 100]) assert.equal(isValidFiveStarBonusPercent(value), true);
  assert.equal(resolveFiveStarBonusPercent(0), 0);
  assert.equal(resolveFiveStarBonusPercent(undefined), 15);
  assert.equal(resolveFiveStarBonusPercent(NaN), 15);
});

test("saved case percentages override project defaults, including an explicit zero", async () => {
  const { resolveCaseFiveStarBonusPercent } = await import("../src/lib/project-quality-bonus");
  assert.equal(resolveCaseFiveStarBonusPercent(25, 15), 25);
  assert.equal(resolveCaseFiveStarBonusPercent(25, 50), 25);
  assert.equal(resolveCaseFiveStarBonusPercent(0, 50), 0);
  assert.equal(resolveCaseFiveStarBonusPercent(null, 20), 20);
  assert.equal(resolveCaseFiveStarBonusPercent(null), 15);
});

test("creation suggestions distinguish scopes within a project and projects sharing a scope", async () => {
  const { suggestedCaseBonusPercent } = await import("../src/lib/project-quality-bonus");
  const scopes = [
    { project: "BC2", scopeOfWork: "Liver", percent: 25 },
    { project: "BC2", scopeOfWork: "Kidney", percent: 0 },
    { project: "BC3", scopeOfWork: "Liver", percent: 40 },
  ];
  const projects = [{ project: "BC2", percent: 20 }];
  assert.equal(suggestedCaseBonusPercent("BC2", "Liver", scopes, projects), 25);
  assert.equal(suggestedCaseBonusPercent(" BC2 ", " Kidney ", scopes, projects), 0);
  assert.equal(suggestedCaseBonusPercent("BC3", "Liver", scopes, projects), 40);
  assert.equal(suggestedCaseBonusPercent("BC2", "Other", scopes, projects), 20);
  assert.equal(suggestedCaseBonusPercent("BC4", "Liver", scopes, projects), 15);
});
