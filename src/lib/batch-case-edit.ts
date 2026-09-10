import { isValidFiveStarBonusPercent } from "@/lib/project-quality-bonus";

/** Null cutoffs preserve each case's current schedule. Replacements must be a valid pair. */
export function resolveBatchCutoffs(deadline: string | null, expiresAt: string | null):
  | { ok: true; data: { deadline?: Date; expiresAt?: Date } }
  | { ok: false; error: "deadline" | "expiry" } {
  if (deadline === null && expiresAt === null) return { ok: true, data: {} };
  if (!deadline || Number.isNaN(new Date(deadline).getTime())) return { ok: false, error: "deadline" };
  if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime()) || new Date(expiresAt) <= new Date(deadline)) {
    return { ok: false, error: "expiry" };
  }
  return { ok: true, data: { deadline: new Date(deadline), expiresAt: new Date(expiresAt) } };
}

/** Omit preserved values so updateMany cannot erase per-case rates or signed payouts. */
export function resolveBatchPayChanges(fiveStarBonusPercent: number | null, annotatorBonus: number | null):
  | { ok: true; data: { fiveStarBonusPercent?: number; annotatorBonus?: number } }
  | { ok: false; error: "quality_bonus" | "invalid_amount" } {
  if (fiveStarBonusPercent !== null && !isValidFiveStarBonusPercent(fiveStarBonusPercent)) {
    return { ok: false, error: "quality_bonus" };
  }
  if (annotatorBonus !== null && !Number.isFinite(annotatorBonus)) return { ok: false, error: "invalid_amount" };
  return { ok: true, data: {
    ...(fiveStarBonusPercent === null ? {} : { fiveStarBonusPercent }),
    ...(annotatorBonus === null ? {} : { annotatorBonus }),
  } };
}
