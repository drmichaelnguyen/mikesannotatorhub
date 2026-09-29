import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  deleteKeyImages,
  listKeyImages,
  readKeyImagesFromFormData,
  saveKeyImagesForCase,
} from "@/lib/key-images";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ChunkMeta = {
  caseIds?: string[];
  clearCaseIds?: string[];
  caseDbIds?: string[];
  scopeOfWork?: string;
  redbrickProject?: string;
};

/**
 * Multipart key-image chunk upload (more reliable than nested server actions
 * for large DICOM folders).
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
    }
    if (user.role !== "REVIEWER") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    let meta: ChunkMeta = {};
    const metaRaw = formData.get("meta");
    if (typeof metaRaw === "string" && metaRaw.trim()) {
      try {
        meta = JSON.parse(metaRaw) as ChunkMeta;
      } catch {
        return NextResponse.json({ ok: false, error: "server" }, { status: 400 });
      }
    }

    const caseIds = [...new Set((meta.caseIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const clearCaseIds = [
      ...new Set((meta.clearCaseIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];
    const caseDbIds = [...new Set((meta.caseDbIds ?? []).map((id) => id.trim()).filter(Boolean))];
    const scopeOfWork = meta.scopeOfWork?.trim() || "";
    const redbrickProject = meta.redbrickProject?.trim() || "";

    if (caseIds.length === 0 && caseDbIds.length === 0) {
      return NextResponse.json({ ok: false, error: "no_cases" }, { status: 400 });
    }

    let rows: { id: string; caseId: string }[];
    if (caseDbIds.length > 0) {
      rows = await prisma.annotationCase.findMany({
        where: { id: { in: caseDbIds } },
        select: { id: true, caseId: true },
      });
    } else if (scopeOfWork && redbrickProject && caseIds.length > 0) {
      rows = await prisma.annotationCase.findMany({
        where: {
          caseId: { in: caseIds },
          scopeOfWork,
          redbrickProject,
        },
        select: { id: true, caseId: true },
      });
    } else {
      return NextResponse.json({ ok: false, error: "scope" }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "no_cases" }, { status: 404 });
    }

    const hintedCaseIds = formData
      .getAll("keyImageCaseIds")
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
    const relevantCaseIds = new Set<string>([...clearCaseIds, ...hintedCaseIds]);
    const activeRows =
      relevantCaseIds.size > 0
        ? rows.filter((row) => relevantCaseIds.has(row.caseId))
        : rows;
    const rowsForWork = activeRows.length > 0 ? activeRows : rows;
    const rowCaseIds = rowsForWork.map((r) => r.caseId);
    const byCaseId = new Map(rows.map((r) => [r.caseId, r]));

    if (clearCaseIds.length > 0) {
      for (const caseId of clearCaseIds) {
        const row = byCaseId.get(caseId);
        if (!row) continue;
        await deleteKeyImages(row.id);
        await prisma.annotationCase.update({
          where: { id: row.id },
          data: { hasKeyImages: false, keyImageCount: 0 },
        });
      }
    }

    const existingNamesByCase = new Map<string, Set<string>>();
    for (const row of rowsForWork) {
      const names = await listKeyImages(row.id);
      if (names.length > 0) {
        existingNamesByCase.set(row.caseId, new Set(names.map((n) => n.toLowerCase())));
      }
    }

    const parsed = await readKeyImagesFromFormData(formData, rowCaseIds, existingNamesByCase);
    const matchedCaseIds: string[] = [];
    let matchedFileCount = 0;

    for (const [caseId, images] of parsed.byCaseId) {
      const row = byCaseId.get(caseId);
      if (!row || images.length === 0) continue;
      const count = await saveKeyImagesForCase(row.id, images, { replace: false });
      await prisma.annotationCase.update({
        where: { id: row.id },
        data: { hasKeyImages: true, keyImageCount: count },
      });
      matchedCaseIds.push(caseId);
      matchedFileCount += images.length;
    }

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return NextResponse.json({
      ok: true,
      matchedCaseIds,
      matchedFileCount,
      unmatchedPaths: parsed.unmatchedPaths,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
