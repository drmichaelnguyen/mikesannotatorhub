"use server";
import { prisma } from "@/lib/prisma";
import { getProjectQualityBonuses, projectBonusKey } from "@/lib/project-quality-settings";
import { isValidFiveStarBonusPercent, resolveFiveStarBonusPercent } from "@/lib/project-quality-bonus";
import { withActionLog } from "@/lib/logged-action";


import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  getDefaultPerMinuteRate,
  setDefaultPerMinuteRate,
} from "@/lib/compensation-defaults";

export async function getDefaultCompensationSettingAction(): Promise<{
  perMinuteRate: number | null;
}> {
  await requireRole("REVIEWER");
  return { perMinuteRate: await getDefaultPerMinuteRate() };
}

export async function updateDefaultCompensationSettingAction(formData: FormData): Promise<
  | { ok: true }
  | { ok: false; error: "required" | "invalid" }
> {
  return withActionLog("updateDefaultCompensationSettingAction", formData, async () => {
    await requireRole("REVIEWER");
    const raw = String(formData.get("perMinuteRate") ?? "").trim();
    if (!raw) return { ok: false as const, error: "required" as const };

    const perMinuteRate = Number(raw);
    if (!Number.isFinite(perMinuteRate) || perMinuteRate < 0) {
      return { ok: false as const, error: "invalid" as const };
    }

    await setDefaultPerMinuteRate(perMinuteRate);
    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const };
  });
}

export async function getProjectQualityBonusSettingsAction() {
  await requireRole("REVIEWER");
  const [settings, cases] = await Promise.all([
    getProjectQualityBonuses(),
    prisma.annotationCase.findMany({ distinct: ["project"], select: { project: true } }),
  ]);
  return [...new Set([...settings.keys(), ...cases.map(row => row.project.trim())])]
    .filter(Boolean).sort().map(project => ({ project, percent: resolveFiveStarBonusPercent(settings.get(project)) }));
}

export async function updateProjectQualityBonusAction(formData: FormData): Promise<
  { ok: true; project: string; percent: number } | { ok: false; error: "invalid" | "server" }
> {
  return withActionLog("updateProjectQualityBonusAction", formData, async () => {
    await requireRole("REVIEWER");
    const project = String(formData.get("project") ?? "").trim();
    const raw = String(formData.get("percent") ?? "").trim();
    const percent = Number(raw);
    if (!project || project.length > 200 || !raw || !isValidFiveStarBonusPercent(percent)) {
      return { ok: false as const, error: "invalid" as const };
    }
    try {
      const key = projectBonusKey(project);
      await prisma.appSetting.upsert({ where: { key }, create: { key, value: String(percent) }, update: { value: String(percent) } });
      revalidatePath("/reviewer");
      revalidatePath("/annotator");
      return { ok: true as const, project, percent };
    } catch {
      return { ok: false as const, error: "server" as const };
    }
  });
}

export async function getCreateCaseBonusDefaultsAction() {
  await requireRole("REVIEWER");
  const [projects, rows] = await Promise.all([
    getProjectQualityBonuses(),
    prisma.annotationCase.findMany({
      where: { fiveStarBonusPercent: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["project", "scopeOfWork"],
      select: { project: true, scopeOfWork: true, fiveStarBonusPercent: true },
    }),
  ]);
  return {
    projects: [...projects].map(([project, percent]) => ({ project, percent })),
    scopes: rows.map(row => ({ project: row.project, scopeOfWork: row.scopeOfWork, percent: resolveFiveStarBonusPercent(row.fiveStarBonusPercent ?? undefined) })),
  };
}
