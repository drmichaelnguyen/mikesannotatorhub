import type { CompensationType } from "@prisma/client";

/** Calendar month key (UTC) for grouping audited payouts. */
export function compensationMonthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Midpoint of recommended min/max minutes (optimal time). */
export function optimalMinutes(
  minMinutes: number | null | undefined,
  maxMinutes: number | null | undefined,
): number {
  const minT =
    typeof minMinutes === "number" && Number.isFinite(minMinutes) && minMinutes > 0
      ? minMinutes
      : 0;
  const maxT =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes) && maxMinutes > 0
      ? maxMinutes
      : minT;
  if (maxT < minT) return minT;
  return (minT + maxT) / 2;
}

/**
 * Minimum case pay for an accepted case: optimal time × rate (PER_MINUTE),
 * or the flat case amount (PER_CASE).
 */
export function computeCaseBasePay(
  type: CompensationType,
  amount: number,
  minMinutes?: number | null,
  maxMinutes?: number | null,
): number {
  if (type === "PER_CASE") return amount;
  const optT = optimalMinutes(minMinutes, maxMinutes);
  return Math.round(amount * optT * 100) / 100;
}

/**
 * Time portion of pay (no quality adjustment).
 *
 * PER_MINUTE: at or under optimal time → full base (opt × rate).
 * Past optimal, marginal rate declines linearly to $0 at max; capped at max.
 * PER_CASE: flat amount.
 */
export function computeTimeCompensation(
  type: CompensationType,
  amount: number,
  minutes: number | null,
  maxMinutes?: number | null,
  minMinutes?: number | null,
): number {
  if (type === "PER_CASE") return amount;

  const minT =
    typeof minMinutes === "number" && Number.isFinite(minMinutes) && minMinutes > 0
      ? minMinutes
      : 0;
  const maxT =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes) && maxMinutes > 0
      ? maxMinutes
      : minT;
  const optT = optimalMinutes(minT, maxT);
  const base = amount * optT;

  // No submitted time yet: show minimum case pay as the estimate.
  if (minutes == null) {
    return Math.round(base * 100) / 100;
  }

  const t = Math.min(Math.max(0, minutes), maxT);
  if (t <= optT || maxT <= optT) {
    return Math.round(base * 100) / 100;
  }

  const extra = t - optT;
  const span = maxT - optT;
  // Marginal rate falls from `amount` at optT to 0 at maxT.
  const overtime = amount * (extra - (extra * extra) / (2 * span));
  return Math.round((base + overtime) * 100) / 100;
}

/**
 * Suggested quality adjustment as a share of case base pay.
 * 5★ bonus, 4★ neutral, 1–3★ penalties. Reject pays 0 (handled separately).
 * Resubmits (prior reject, then accepted) also take a −10% case-base penalty,
 * including at 4★ where quality alone would be neutral.
 */
const QUALITY_ADJUSTMENT_RATE: Record<number, number> = {
  5: 0.15,
  4: 0,
  3: -0.1,
  2: -0.25,
  1: -0.4,
};

/** Share of minimum case pay subtracted when a case was rejected then resubmitted. */
export const RESUBMIT_PENALTY_RATE = 0.1;

/**
 * Resubmit −10% penalty applies only for accepts in this UTC calendar month or later.
 * Earlier payouts keep pre-July-2026 rules.
 */
export const RESUBMIT_PENALTY_START_MONTH_UTC = "2026-07";

/** True when the case has at least one prior REJECT review. */
export function caseWasResubmitted(reviews: { decision: string }[] | null | undefined): boolean {
  return (reviews ?? []).some((r) => r.decision === "REJECT");
}

/** Whether the resubmit pay rule is in effect for an accept/audit timestamp. */
export function resubmitPenaltyAppliesAt(at: Date = new Date()): boolean {
  return compensationMonthKeyUtc(at) >= RESUBMIT_PENALTY_START_MONTH_UTC;
}

/**
 * Prior reject and accept date is on/after July 2026 (UTC).
 * Use for suggestions, stored-bonus defaults, and UI notes.
 */
export function resubmitPenaltyApplies(
  hadPriorReject: boolean,
  at: Date | string | null | undefined = new Date(),
): boolean {
  if (!hadPriorReject) return false;
  const date = at == null || at === "" ? new Date() : typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return false;
  return resubmitPenaltyAppliesAt(date);
}

/** Suggested signed quality adjustment for an accepted case. */
export function suggestedQualityAdjustment(
  qualityRating: number,
  caseBasePay: number,
  options?: { wasResubmitted?: boolean; at?: Date | string | null },
): number {
  if (!Number.isInteger(qualityRating) || qualityRating < 1 || qualityRating > 5) return 0;
  if (!Number.isFinite(caseBasePay) || caseBasePay <= 0) return 0;
  const rate = QUALITY_ADJUSTMENT_RATE[qualityRating] ?? 0;
  const qualityPart = caseBasePay * rate;
  const resubmitPenalty = resubmitPenaltyApplies(Boolean(options?.wasResubmitted), options?.at)
    ? caseBasePay * RESUBMIT_PENALTY_RATE
    : 0;
  return Math.round((qualityPart - resubmitPenalty) * 100) / 100;
}

/** Final compensation for an audited (or legacy accepted) case. */
export function computeCompensation(
  type: CompensationType,
  amount: number,
  minutes: number | null,
  maxMinutes?: number | null,
  minMinutes?: number | null,
  annotatorBonus = 0,
): number {
  if (!Number.isFinite(annotatorBonus)) {
    annotatorBonus = 0;
  }
  const timePay = computeTimeCompensation(type, amount, minutes, maxMinutes, minMinutes);
  return Math.max(0, Math.round((timePay + annotatorBonus) * 100) / 100);
}

export type CaseCompensationBreakdown = {
  type: CompensationType;
  rateOrAmount: number;
  annotationMinutes: number | null;
  minMinutes: number;
  maxMinutes: number;
  optimalMinutes: number;
  minimumCasePay: number;
  /** Minutes used for pay (capped at max); null when no time submitted. */
  billableMinutes: number | null;
  overtimeMinutes: number;
  overtimePay: number;
  baseCompensation: number;
  qualityAdjustment: number;
  totalCompensation: number;
  /** Finished at or under optimal time (or no time yet / flat per-case). */
  atOrUnderOptimal: boolean;
  /** Submitted time exceeded the max and was capped. */
  cappedAtMax: boolean;
};

/** Intermediate values for explaining a case payout. */
export function buildCaseCompensationBreakdown(
  type: CompensationType,
  amount: number,
  minutes: number | null,
  maxMinutes?: number | null,
  minMinutes?: number | null,
  annotatorBonus = 0,
): CaseCompensationBreakdown {
  const bonus = Number.isFinite(annotatorBonus) ? annotatorBonus : 0;
  const minT =
    typeof minMinutes === "number" && Number.isFinite(minMinutes) && minMinutes > 0
      ? minMinutes
      : 0;
  const maxT =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes) && maxMinutes > 0
      ? maxMinutes
      : minT;
  const optT = optimalMinutes(minT, maxT);
  const minimumCasePay = computeCaseBasePay(type, amount, minT, maxT);
  const baseCompensation = computeTimeCompensation(type, amount, minutes, maxT, minT);
  const totalCompensation = Math.max(0, Math.round((baseCompensation + bonus) * 100) / 100);

  if (type === "PER_CASE") {
    return {
      type,
      rateOrAmount: amount,
      annotationMinutes: minutes,
      minMinutes: minT,
      maxMinutes: maxT,
      optimalMinutes: optT,
      minimumCasePay,
      billableMinutes: minutes,
      overtimeMinutes: 0,
      overtimePay: 0,
      baseCompensation,
      qualityAdjustment: bonus,
      totalCompensation,
      atOrUnderOptimal: true,
      cappedAtMax: false,
    };
  }

  if (minutes == null) {
    return {
      type,
      rateOrAmount: amount,
      annotationMinutes: null,
      minMinutes: minT,
      maxMinutes: maxT,
      optimalMinutes: optT,
      minimumCasePay,
      billableMinutes: null,
      overtimeMinutes: 0,
      overtimePay: 0,
      baseCompensation,
      qualityAdjustment: bonus,
      totalCompensation,
      atOrUnderOptimal: true,
      cappedAtMax: false,
    };
  }

  const billableMinutes = Math.min(Math.max(0, minutes), maxT);
  const cappedAtMax = minutes > maxT && maxT > 0;
  const atOrUnderOptimal = billableMinutes <= optT || maxT <= optT;
  const overtimeMinutes = atOrUnderOptimal ? 0 : billableMinutes - optT;
  const overtimePay = Math.round((baseCompensation - minimumCasePay) * 100) / 100;

  return {
    type,
    rateOrAmount: amount,
    annotationMinutes: minutes,
    minMinutes: minT,
    maxMinutes: maxT,
    optimalMinutes: optT,
    minimumCasePay,
    billableMinutes,
    overtimeMinutes,
    overtimePay,
    baseCompensation,
    qualityAdjustment: bonus,
    totalCompensation,
    atOrUnderOptimal,
    cappedAtMax,
  };
}
