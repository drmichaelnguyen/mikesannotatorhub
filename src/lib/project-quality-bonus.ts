export const DEFAULT_FIVE_STAR_BONUS_PERCENT = 15;

export function isValidFiveStarBonusPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
}

export function resolveFiveStarBonusPercent(value?: number): number {
  return value != null && isValidFiveStarBonusPercent(value) ? value : DEFAULT_FIVE_STAR_BONUS_PERCENT;
}

export type CaseBonusDefault = { project: string; scopeOfWork: string; percent: number };

/** A saved case percentage, including zero, always wins over later default changes. */
export function resolveCaseFiveStarBonusPercent(saved: number | null | undefined, projectDefault?: number): number {
  return resolveFiveStarBonusPercent(saved ?? projectDefault);
}

export function suggestedCaseBonusPercent(
  project: string,
  scopeOfWork: string,
  scopeDefaults: CaseBonusDefault[],
  projectDefaults: { project: string; percent: number }[],
): number {
  const match = scopeDefaults.find(row => row.project === project.trim() && row.scopeOfWork === scopeOfWork.trim());
  return resolveFiveStarBonusPercent(match?.percent ?? projectDefaults.find(row => row.project === project.trim())?.percent);
}
