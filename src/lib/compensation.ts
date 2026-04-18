import type { CompensationType } from "@prisma/client";

/** Final compensation for an audited (or legacy accepted) case. */
export function computeCompensation(
  type: CompensationType,
  amount: number,
  minutes: number | null,
): number {
  if (type === "PER_CASE") return amount;
  const m = minutes ?? 0;
  return Math.round(amount * m * 100) / 100;
}
