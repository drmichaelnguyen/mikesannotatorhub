import { resolveFiveStarBonusPercent } from "@/lib/project-quality-bonus";
import type { CompensationType } from "@prisma/client";

/** Calendar month key (UTC) for grouping audited payouts. */
export function compensationMonthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Hours from issue time to deadline.
 * Negative when the deadline is already past.
 */
export function hoursFromIssueToDeadline(
  deadline: Date | string | null | undefined,
  issuedAt: Date | string | null | undefined = new Date(),
): number | null {
  const due = asDate(deadline);
  const issued = asDate(issuedAt) ?? new Date();
  if (!due) return null;
  return (due.getTime() - issued.getTime()) / (1000 * 60 * 60);
}

/**
 * Rush bonus share of base compensation from issue→deadline window:
 * <8h → 15%, 8–24h → 10%, 24–<72h → 5%, ≥72h → 0%.
 */
export function rushPercentFromHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  if (hours < 8) return 15;
  if (hours < 24) return 10;
  if (hours < 72) return 5;
  return 0;
}

/**
 * Rush bonus share of base compensation from issue→deadline window:
 * <8h → 15%, 8–24h → 10%, 24–<72h → 5%, ≥72h → 0%.
 */
export function rushPercentFromDeadline(
  deadline: Date | string | null | undefined,
  issuedAt: Date | string | null | undefined = new Date(),
): number {
  const hours = hoursFromIssueToDeadline(deadline, issuedAt);
  if (hours == null) return 0;
  return rushPercentFromHours(hours);
}

/** True when the case was submitted after its deadline. */
export function submittedPastDeadline(
  deadline: Date | string | null | undefined,
  submittedAt: Date | string | null | undefined,
): boolean {
  const due = asDate(deadline);
  const done = asDate(submittedAt);
  if (!due || !done) return false;
  return done.getTime() > due.getTime();
}

type ReviewResubmitFields = {
  decision: string;
  /** Annotator whose work was reviewed; required to attribute a reject. */
  annotatorId?: string | null;
};

/** True when this annotator has at least one prior REJECT on the case. */
export function caseWasResubmitted(
  reviews: ReviewResubmitFields[] | null | undefined,
  annotatorId?: string | null,
): boolean {
  if (!annotatorId) return false;
  return (reviews ?? []).some(
    (r) => r.decision === "REJECT" && r.annotatorId === annotatorId,
  );
}

export type CaseRushInput = {
  deadline?: Date | string | null;
  createdAt?: Date | string | null;
  /** Submit / complete time; late submit forfeits urgency. */
  completedAt?: Date | string | null;
  /** Alias for completedAt (stats rows). */
  submittedAt?: Date | string | null;
  status?: string | null;
  /** Explicit prior-reject flag (preferred). */
  wasRejected?: boolean;
  /**
   * Also treated as rejected for urgency (callers that only have the
   * resubmit-penalty flag). Prefer `wasRejected` / reviews when possible.
   */
  wasResubmitted?: boolean;
  annotatorId?: string | null;
  reviews?: ReviewResubmitFields[] | null;
  /** Nested annotator id when `annotatorId` is not set (serialized reviewer case). */
  annotator?: { id: string } | null;
};

/**
 * Urgency (rush) % for a case.
 * Forfeited when: prior reject / rejected status, or submitted after deadline.
 * Otherwise based on hours from issue (`createdAt`) to deadline.
 */
export function caseRushPercent(row: CaseRushInput): number {
  const annotatorId = row.annotatorId ?? row.annotator?.id ?? null;
  const rejected =
    row.wasRejected === true ||
    row.wasResubmitted === true ||
    row.status === "REJECTED" ||
    caseWasResubmitted(row.reviews, annotatorId);
  if (rejected) return 0;

  const submittedAt = row.completedAt ?? row.submittedAt;
  if (submittedPastDeadline(row.deadline, submittedAt)) return 0;

  return rushPercentFromDeadline(row.deadline, row.createdAt);
}

/** Why urgency was forfeited, if applicable (for UI copy). */
export function caseRushForfeitReason(
  row: CaseRushInput,
): "rejected" | "late" | null {
  const annotatorId = row.annotatorId ?? row.annotator?.id ?? null;
  const rejected =
    row.wasRejected === true ||
    row.wasResubmitted === true ||
    row.status === "REJECTED" ||
    caseWasResubmitted(row.reviews, annotatorId);
  if (rejected) return "rejected";
  const submittedAt = row.completedAt ?? row.submittedAt;
  if (submittedPastDeadline(row.deadline, submittedAt)) return "late";
  return null;
}

/** Apply a rush percent to a stored base rate/amount. */
export function applyRushToAmount(amount: number, rushPercent: number): number {
  if (!Number.isFinite(amount)) return 0;
  if (!Number.isFinite(rushPercent) || rushPercent <= 0) {
    return Math.round(amount * 100) / 100;
  }
  return Math.round(amount * (1 + rushPercent / 100) * 100) / 100;
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
 * or the flat case amount (PER_CASE). Includes rush multiplier when set.
 */
export function computeCaseBasePay(
  type: CompensationType,
  amount: number,
  minMinutes?: number | null,
  maxMinutes?: number | null,
  rushPercent = 0,
): number {
  const effective = applyRushToAmount(amount, rushPercent);
  if (type === "PER_CASE") return effective;
  const optT = optimalMinutes(minMinutes, maxMinutes);
  return Math.round(effective * optT * 100) / 100;
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
  rushPercent = 0,
): number {
  const effective = applyRushToAmount(amount, rushPercent);
  if (type === "PER_CASE") return effective;

  const minT =
    typeof minMinutes === "number" && Number.isFinite(minMinutes) && minMinutes > 0
      ? minMinutes
      : 0;
  const maxT =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes) && maxMinutes > 0
      ? maxMinutes
      : minT;
  const optT = optimalMinutes(minT, maxT);
  const base = effective * optT;

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
  // Marginal rate falls from `effective` at optT to 0 at maxT.
  const overtime = effective * (extra - (extra * extra) / (2 * span));
  return Math.round((base + overtime) * 100) / 100;
}

/**
 * Suggested quality adjustment as a share of case base pay.
 * 5★ bonus, 4★ neutral, 1–3★ penalties. Reject pays 0 (handled separately).
 * Same-annotator resubmits (prior reject of that annotator, then accepted) also
 * take a −10% case-base penalty, including at 4★. A new annotator on a
 * previously rejected case is paid normally.
 */
const QUALITY_ADJUSTMENT_RATE: Record<number, number> = {
  5: 0.15,
  4: 0,
  3: -0.1,
  2: -0.25,
  1: -0.4,
};

/** Share of minimum case pay subtracted when the same annotator resubmits after a reject. */
export const RESUBMIT_PENALTY_RATE = 0.1;

/**
 * Resubmit −10% penalty applies only for accepts in this UTC calendar month or later.
 * Earlier payouts keep pre-July-2026 rules.
 */
export const RESUBMIT_PENALTY_START_MONTH_UTC = "2026-07";

/** Whether the resubmit pay rule is in effect for an accept/audit timestamp. */
export function resubmitPenaltyAppliesAt(at: Date = new Date()): boolean {
  return compensationMonthKeyUtc(at) >= RESUBMIT_PENALTY_START_MONTH_UTC;
}

/**
 * Same-annotator prior reject and accept date is on/after July 2026 (UTC).
 * Use for suggestions, stored-bonus defaults, and UI notes.
 */
export function resubmitPenaltyApplies(
  hadPriorRejectBySameAnnotator: boolean,
  at: Date | string | null | undefined = new Date(),
): boolean {
  if (!hadPriorRejectBySameAnnotator) return false;
  const date = at == null || at === "" ? new Date() : typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(date.getTime())) return false;
  return resubmitPenaltyAppliesAt(date);
}

/** Suggested signed quality adjustment for an accepted case. */
export function suggestedQualityAdjustment(
  qualityRating: number,
  caseBasePay: number,
  options?: { wasResubmitted?: boolean; at?: Date | string | null; fiveStarBonusPercent?: number },
): number {
  if (!Number.isInteger(qualityRating) || qualityRating < 1 || qualityRating > 5) return 0;
  if (!Number.isFinite(caseBasePay) || caseBasePay <= 0) return 0;
  const rate = qualityRating === 5
    ? resolveFiveStarBonusPercent(options?.fiveStarBonusPercent) / 100
    : QUALITY_ADJUSTMENT_RATE[qualityRating] ?? 0;
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
  rushPercent = 0,
): number {
  if (!Number.isFinite(annotatorBonus)) {
    annotatorBonus = 0;
  }
  const timePay = computeTimeCompensation(
    type,
    amount,
    minutes,
    maxMinutes,
    minMinutes,
    rushPercent,
  );
  return Math.max(0, Math.round((timePay + annotatorBonus) * 100) / 100);
}

export type CaseCompensationBreakdown = {
  type: CompensationType;
  /** Stored base rate/amount before rush. */
  baseRateOrAmount: number;
  /** Effective rate/amount after rush. */
  rateOrAmount: number;
  rushPercent: number;
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

export type CasePayProspect = {
  type: CompensationType;
  baseRateOrAmount: number;
  effectiveRateOrAmount: number;
  minMinutes: number;
  maxMinutes: number;
  /** Additive maximum-pay components; urgency is separated from base and overtime. */
  basePayBeforeRush: number;
  maximumOvertimeMinutes: number;
  maximumOvertimePayBeforeRush: number;
  maximumRushBonus: number;
  fiveStarBonusPercent: number;
  fiveStarQualityBonus: number;
  resubmitDeduction: number;
  roundingAdjustment: number;
  optimalMinutes: number;
  minimumCasePay: number;
  /** Time pay if annotation finishes at max recommended minutes. */
  maximumTimePay: number;
  /** Upper bound: max time pay + 5★ quality bonus (minus resubmit penalty if applicable). */
  maximumPotentialPay: number;
  rushPercent: number;
};

/** Estimated pay range before a case is audited (for annotator case picking). */
export function buildCasePayProspect(
  type: CompensationType,
  amount: number,
  minMinutes?: number | null,
  maxMinutes?: number | null,
  options?: { wasResubmitted?: boolean; rushPercent?: number; fiveStarBonusPercent?: number },
): CasePayProspect {
  const rushPercent = options?.rushPercent ?? 0;
  const minT =
    typeof minMinutes === "number" && Number.isFinite(minMinutes) && minMinutes > 0
      ? minMinutes
      : 0;
  const maxT =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes) && maxMinutes > 0
      ? maxMinutes
      : minT;
  const optT = optimalMinutes(minT, maxT);
  const minimumCasePay = computeCaseBasePay(type, amount, minT, maxT, rushPercent);
  const maximumTimePay = computeTimeCompensation(type, amount, maxT, maxT, minT, rushPercent);
  const qualityBonus = suggestedQualityAdjustment(5, minimumCasePay, {
    wasResubmitted: options?.wasResubmitted,
    fiveStarBonusPercent: options?.fiveStarBonusPercent,
  });
  const maximumPotentialPay = Math.max(
    0,
    Math.round((maximumTimePay + qualityBonus) * 100) / 100,
  );
  const round = (value: number) => Math.round(value * 100) / 100;
  const basePayBeforeRush = computeCaseBasePay(type, amount, minT, maxT);
  const timePayBeforeRush = computeTimeCompensation(type, amount, maxT, maxT, minT);
  const maximumOvertimePayBeforeRush = round(timePayBeforeRush - basePayBeforeRush);
  const maximumRushBonus = round(maximumTimePay - timePayBeforeRush);
  const fiveStarBonusPercent = resolveFiveStarBonusPercent(options?.fiveStarBonusPercent);
  const fiveStarQualityBonus = suggestedQualityAdjustment(5, minimumCasePay, { fiveStarBonusPercent });
  const resubmitDeduction = resubmitPenaltyApplies(Boolean(options?.wasResubmitted))
    ? round(minimumCasePay * RESUBMIT_PENALTY_RATE)
    : 0;
  // Payout rounds the net quality adjustment, while these explanatory rows are rounded individually.
  const roundingAdjustment = round(maximumPotentialPay - round(
    basePayBeforeRush + maximumOvertimePayBeforeRush + maximumRushBonus + fiveStarQualityBonus - resubmitDeduction,
  ));
  return {
    type,
    baseRateOrAmount: amount,
    effectiveRateOrAmount: applyRushToAmount(amount, rushPercent),
    minMinutes: minT,
    maxMinutes: maxT,
    basePayBeforeRush,
    maximumOvertimeMinutes: type === "PER_MINUTE" ? Math.max(0, maxT - optT) : 0,
    maximumOvertimePayBeforeRush,
    maximumRushBonus,
    fiveStarBonusPercent,
    fiveStarQualityBonus,
    resubmitDeduction,
    roundingAdjustment,
    optimalMinutes: optT,
    minimumCasePay,
    maximumTimePay,
    maximumPotentialPay,
    rushPercent,
  };
}

/** Intermediate values for explaining a case payout. */
export function buildCaseCompensationBreakdown(
  type: CompensationType,
  amount: number,
  minutes: number | null,
  maxMinutes?: number | null,
  minMinutes?: number | null,
  annotatorBonus = 0,
  rushPercent = 0,
): CaseCompensationBreakdown {
  const bonus = Number.isFinite(annotatorBonus) ? annotatorBonus : 0;
  const rush = Number.isFinite(rushPercent) ? rushPercent : 0;
  const effective = applyRushToAmount(amount, rush);
  const minT =
    typeof minMinutes === "number" && Number.isFinite(minMinutes) && minMinutes > 0
      ? minMinutes
      : 0;
  const maxT =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes) && maxMinutes > 0
      ? maxMinutes
      : minT;
  const optT = optimalMinutes(minT, maxT);
  const minimumCasePay = computeCaseBasePay(type, amount, minT, maxT, rush);
  const baseCompensation = computeTimeCompensation(type, amount, minutes, maxT, minT, rush);
  const totalCompensation = Math.max(0, Math.round((baseCompensation + bonus) * 100) / 100);

  if (type === "PER_CASE") {
    return {
      type,
      baseRateOrAmount: amount,
      rateOrAmount: effective,
      rushPercent: rush,
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
      baseRateOrAmount: amount,
      rateOrAmount: effective,
      rushPercent: rush,
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
    baseRateOrAmount: amount,
    rateOrAmount: effective,
    rushPercent: rush,
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
