import { prisma } from "@/lib/prisma";
import { resolveFiveStarBonusPercent } from "@/lib/project-quality-bonus";

const PREFIX = "project_five_star_bonus:";
export function projectBonusKey(project: string) { return PREFIX + project.trim(); }

export async function getProjectQualityBonuses(): Promise<Map<string, number>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX } } });
  return new Map(rows.map(row => [row.key.slice(PREFIX.length), resolveFiveStarBonusPercent(row.value.trim() ? Number(row.value) : undefined)]));
}

export async function getProjectFiveStarBonusPercent(project: string): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: projectBonusKey(project) } });
  return resolveFiveStarBonusPercent(row?.value.trim() ? Number(row.value) : undefined);
}
