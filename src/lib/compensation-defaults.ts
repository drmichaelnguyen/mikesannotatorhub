import { CompensationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_PER_MINUTE_RATE_KEY = "default_per_minute_rate";

export async function getDefaultPerMinuteRate(): Promise<number | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: DEFAULT_PER_MINUTE_RATE_KEY },
    select: { value: true },
  });
  if (!row) return null;
  const amount = Number(row.value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

export async function setDefaultPerMinuteRate(amount: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: DEFAULT_PER_MINUTE_RATE_KEY },
    create: { key: DEFAULT_PER_MINUTE_RATE_KEY, value: String(amount) },
    update: { value: String(amount) },
  });
}

/** Blank base rate: latest project/scope rate, then project, then global default. */
export async function resolveBlankCompensation(
  redbrickProject: string,
  scopeOfWork: string,
): Promise<{ compensationType: CompensationType; compensationAmount: number } | null> {
  const prior =
    (await prisma.annotationCase.findFirst({
      where: { redbrickProject, scopeOfWork },
      orderBy: { createdAt: "desc" },
      select: { compensationType: true, compensationAmount: true },
    })) ??
    (await prisma.annotationCase.findFirst({
      where: { redbrickProject },
      orderBy: { createdAt: "desc" },
      select: { compensationType: true, compensationAmount: true },
    }));

  if (prior) {
    return {
      compensationType: prior.compensationType,
      compensationAmount: prior.compensationAmount,
    };
  }

  const defaultRate = await getDefaultPerMinuteRate();
  if (defaultRate == null) return null;

  return {
    compensationType: CompensationType.PER_MINUTE,
    compensationAmount: defaultRate,
  };
}
