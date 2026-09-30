"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  parseCaseStudyHistoryTable,
  stagesToJson,
  type ParsedCaseStudyHistoryRow,
} from "@/lib/case-study-history";
import { withActionLog } from "@/lib/logged-action";
import { prisma } from "@/lib/prisma";

export type ImportCaseStudyHistoryResult =
  | { ok: true; imported: number; updated: number }
  | { ok: false; error: "empty" | "no_rows" };

/** Upsert parsed history rows keyed by normalized study ID. */
export async function upsertCaseStudyHistoryRows(
  rows: ParsedCaseStudyHistoryRow[],
): Promise<{ imported: number; updated: number }> {
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.caseStudyHistory.findUnique({
      where: { studyIdNorm: row.studyIdNorm },
      select: { id: true },
    });
    await prisma.caseStudyHistory.upsert({
      where: { studyIdNorm: row.studyIdNorm },
      create: {
        studyId: row.studyId,
        studyIdNorm: row.studyIdNorm,
        redbrickStage: row.redbrickStage,
        stagesJson: stagesToJson(row.stages),
      },
      update: {
        studyId: row.studyId,
        redbrickStage: row.redbrickStage,
        stagesJson: stagesToJson(row.stages),
      },
    });
    if (existing) updated += 1;
    else imported += 1;
  }

  return { imported, updated };
}

/** Parse + upsert a pasted/CSV history table. Empty input is a no-op success. */
export async function upsertCaseStudyHistoryFromTable(
  raw: string,
): Promise<{ imported: number; updated: number; rowCount: number }> {
  const trimmed = raw.trim();
  if (!trimmed) return { imported: 0, updated: 0, rowCount: 0 };
  const rows = parseCaseStudyHistoryTable(trimmed);
  if (rows.length === 0) return { imported: 0, updated: 0, rowCount: 0 };
  const counts = await upsertCaseStudyHistoryRows(rows);
  return { ...counts, rowCount: rows.length };
}

export async function importCaseStudyHistoryAction(
  formData: FormData,
): Promise<ImportCaseStudyHistoryResult> {
  return withActionLog("importCaseStudyHistoryAction", formData, async () => {
    await requireRole("REVIEWER");
    const raw = String(formData.get("historyTable") ?? "");
    if (!raw.trim()) return { ok: false as const, error: "empty" as const };

    const rows = parseCaseStudyHistoryTable(raw);
    if (rows.length === 0) return { ok: false as const, error: "no_rows" as const };

    const { imported, updated } = await upsertCaseStudyHistoryRows(rows);

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const, imported, updated };
  });
}
