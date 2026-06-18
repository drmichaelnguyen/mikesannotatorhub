import type { CompensationType } from "@prisma/client";

/** Calendar month key (UTC) for grouping audited payouts. */
export function compensationMonthKeyUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Final compensation for an audited (or legacy accepted) case. */
export function computeCompensation(
  type: CompensationType,
  amount: number,
  minutes: number | null,
  maxMinutes?: number | null,
  annotatorBonus = 0,
): number {
  if (!Number.isFinite(annotatorBonus) || annotatorBonus < 0) {
    annotatorBonus = 0;
  }
  if (type === "PER_CASE") return amount + annotatorBonus;
  const submittedMinutes = minutes ?? 0;
  const m =
    typeof maxMinutes === "number" && Number.isFinite(maxMinutes)
      ? Math.min(submittedMinutes, maxMinutes)
      : submittedMinutes;
  return Math.round((amount * m + annotatorBonus) * 100) / 100;
}
