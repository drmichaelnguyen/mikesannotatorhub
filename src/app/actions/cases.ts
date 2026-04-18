"use server";

import { CaseStatus, CompensationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireRole } from "@/lib/auth";

const caseNoteInclude = {
  caseNotes: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
} as const;

function payout(
  type: CompensationType,
  amount: number,
  minutes: number | null,
): number {
  if (type === "PER_CASE") return amount;
  const m = minutes ?? 0;
  return Math.round(amount * m * 100) / 100;
}

function parseCaseIdBatch(raw: string): { unique: string[]; duplicateTokens: string[] } {
  const tokens = raw
    .split(/[\r\n,;\t]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicateTokens: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) {
      duplicateTokens.push(t);
      continue;
    }
    seen.add(t);
    unique.push(t);
  }
  return { unique, duplicateTokens };
}

export type CreateCaseActionResult =
  | {
      ok: true;
      created: number;
      skippedExisting: string[];
      duplicateInList: string[];
    }
  | { ok: false; error: "required" | "no_ids" };

export async function createCaseAction(formData: FormData): Promise<CreateCaseActionResult> {
  await requireRole("REVIEWER");
  const rawIds = String(formData.get("caseIds") ?? "").trim();
  const { unique, duplicateTokens } = parseCaseIdBatch(rawIds);
  const duplicateInList = [...new Set(duplicateTokens)];

  const redbrickProject = String(formData.get("redbrickProject") ?? "").trim();
  const guideline = String(formData.get("guideline") ?? "").trim();
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
  const maxMinutesPerCase = Number(formData.get("maxMinutesPerCase"));
  const compensationType =
    String(formData.get("compensationType") ?? "") === "PER_MINUTE"
      ? CompensationType.PER_MINUTE
      : CompensationType.PER_CASE;
  const compensationAmount = Number(formData.get("compensationAmount"));

  if (
    !redbrickProject ||
    !guideline ||
    !scopeOfWork ||
    !Number.isFinite(maxMinutesPerCase) ||
    maxMinutesPerCase <= 0 ||
    !Number.isFinite(compensationAmount) ||
    compensationAmount < 0
  ) {
    return { ok: false as const, error: "required" };
  }

  if (unique.length === 0) {
    return { ok: false as const, error: "no_ids" };
  }

  const assignEmail = String(formData.get("assignEmail") ?? "")
    .trim()
    .toLowerCase();
  let annotatorId: string | undefined;
  let status: CaseStatus = CaseStatus.AVAILABLE;
  let assignedAt: Date | undefined;
  if (assignEmail) {
    const u = await prisma.user.findUnique({ where: { email: assignEmail } });
    if (u?.role === "ANNOTATOR") {
      annotatorId = u.id;
      status = CaseStatus.ASSIGNED;
      assignedAt = new Date();
    }
  }

  const existingRows = await prisma.annotationCase.findMany({
    where: { caseId: { in: unique } },
    select: { caseId: true },
  });
  const existingSet = new Set(existingRows.map((r) => r.caseId));
  const skippedExisting = unique.filter((id) => existingSet.has(id));
  const toCreate = unique.filter((id) => !existingSet.has(id));

  const base = {
    redbrickProject,
    guideline,
    scopeOfWork,
    maxMinutesPerCase: Math.floor(maxMinutesPerCase),
    compensationType,
    compensationAmount,
    annotatorId,
    status,
    assignedAt,
  };

  let created = 0;
  if (toCreate.length > 0) {
    const res = await prisma.annotationCase.createMany({
      data: toCreate.map((caseId) => ({ ...base, caseId })),
    });
    created = res.count;
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return {
    ok: true as const,
    created,
    skippedExisting,
    duplicateInList,
  };
}

export async function assignCaseAction(caseDbId: string) {
  const user = await requireRole("ANNOTATOR");
  const row = await prisma.annotationCase.findUnique({ where: { id: caseDbId } });
  if (!row || row.status !== CaseStatus.AVAILABLE) {
    return { ok: false as const, error: "state" };
  }
  await prisma.annotationCase.update({
    where: { id: caseDbId },
    data: {
      annotatorId: user.id,
      status: CaseStatus.ASSIGNED,
      assignedAt: new Date(),
      completedAt: null,
      annotationMinutes: null,
    },
  });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function submitAnnotationAction(caseDbId: string, minutes: number) {
  const user = await requireRole("ANNOTATOR");
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false as const, error: "minutes" };
  }
  const row = await prisma.annotationCase.findUnique({ where: { id: caseDbId } });
  if (!row || row.annotatorId !== user.id) {
    return { ok: false as const, error: "forbidden" };
  }
  if (row.status !== CaseStatus.ASSIGNED && row.status !== CaseStatus.REJECTED) {
    return { ok: false as const, error: "state" };
  }
  await prisma.annotationCase.update({
    where: { id: caseDbId },
    data: {
      status: CaseStatus.SUBMITTED,
      annotationMinutes: Math.floor(minutes),
      completedAt: new Date(),
    },
  });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function reviewCaseAction(input: {
  caseDbId: string;
  decision: "ACCEPT" | "REJECT";
  comment: string;
  screenshotData: string | null;
}) {
  const reviewer = await requireRole("REVIEWER");
  const row = await prisma.annotationCase.findUnique({
    where: { id: input.caseDbId },
    include: { annotator: true },
  });
  if (!row || row.status !== CaseStatus.SUBMITTED) {
    return { ok: false as const, error: "state" };
  }

  const nextStatus =
    input.decision === "ACCEPT" ? CaseStatus.ACCEPTED : CaseStatus.REJECTED;

  await prisma.$transaction([
    prisma.review.create({
      data: {
        annotationCaseId: row.id,
        reviewerId: reviewer.id,
        decision: input.decision,
        comment: input.comment.trim() || null,
        screenshotData: input.screenshotData,
      },
    }),
    prisma.annotationCase.update({
      where: { id: row.id },
      data: { status: nextStatus },
    }),
  ]);

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return {
    ok: true as const,
    payout: payout(row.compensationType, row.compensationAmount, row.annotationMinutes),
  };
}

export async function addCaseNoteAction(input: {
  caseDbId: string;
  content: string;
  imageData: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const row = await prisma.annotationCase.findUnique({ where: { id: input.caseDbId } });
  if (!row) return { ok: false as const, error: "notfound" as const };

  if (user.role === "ANNOTATOR") {
    if (row.annotatorId !== user.id) {
      return { ok: false as const, error: "forbidden" as const };
    }
  } else if (user.role !== "REVIEWER") {
    return { ok: false as const, error: "forbidden" as const };
  }

  const text = input.content.trim();
  const img = input.imageData?.trim() ? input.imageData.trim() : null;
  if (!text && !img) {
    return { ok: false as const, error: "empty" as const };
  }

  await prisma.caseNote.create({
    data: {
      annotationCaseId: row.id,
      authorId: user.id,
      content: text || null,
      imageData: img,
    },
  });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function listCasesForReviewer() {
  await requireRole("REVIEWER");
  return prisma.annotationCase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      annotator: true,
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      ...caseNoteInclude,
    },
  });
}

export async function getAnnotatorBoard() {
  const user = await requireRole("ANNOTATOR");
  return listCasesForAnnotator(user.id);
}

export type AnnotatorProjectRow = {
  name: string;
  acceptedCount: number;
  totalCompensation: number;
};

export type AnnotatorCompensationSummary = {
  thisMonth: number;
  priorMonths: number;
  allTime: number;
  projects: AnnotatorProjectRow[];
};

/** Accepted cases only; month boundaries use the viewer's local calendar. */
export async function getAnnotatorCompensationSummary(): Promise<AnnotatorCompensationSummary> {
  const user = await requireRole("ANNOTATOR");
  const cases = await prisma.annotationCase.findMany({
    where: { annotatorId: user.id, status: CaseStatus.ACCEPTED },
    include: {
      reviews: {
        where: { decision: "ACCEPT" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const startCurrent = new Date(y, mo, 1, 0, 0, 0, 0);
  const startNext = new Date(y, mo + 1, 1, 0, 0, 0, 0);

  let thisMonth = 0;
  let priorMonths = 0;
  const byProject = new Map<string, { acceptedCount: number; totalCompensation: number }>();

  for (const c of cases) {
    const amount = payout(c.compensationType, c.compensationAmount, c.annotationMinutes);
    const acceptedAt = c.reviews[0]?.createdAt ?? c.updatedAt;

    if (acceptedAt >= startCurrent && acceptedAt < startNext) {
      thisMonth += amount;
    } else if (acceptedAt < startCurrent) {
      priorMonths += amount;
    } else {
      thisMonth += amount;
    }

    const key = c.redbrickProject.trim() || "—";
    const prev = byProject.get(key) ?? { acceptedCount: 0, totalCompensation: 0 };
    prev.acceptedCount += 1;
    prev.totalCompensation += amount;
    byProject.set(key, prev);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const projects = Array.from(byProject.entries())
    .map(([name, v]) => ({
      name,
      acceptedCount: v.acceptedCount,
      totalCompensation: round2(v.totalCompensation),
    }))
    .sort((a, b) => b.totalCompensation - a.totalCompensation);

  return {
    thisMonth: round2(thisMonth),
    priorMonths: round2(priorMonths),
    allTime: round2(thisMonth + priorMonths),
    projects,
  };
}

export async function listCasesForAnnotator(userId: string) {
  const available = await prisma.annotationCase.findMany({
    where: { status: CaseStatus.AVAILABLE },
    orderBy: { createdAt: "desc" },
    include: { ...caseNoteInclude },
  });
  const mine = await prisma.annotationCase.findMany({
    where: {
      annotatorId: userId,
      status: { in: [CaseStatus.ASSIGNED, CaseStatus.SUBMITTED, CaseStatus.ACCEPTED] },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      ...caseNoteInclude,
    },
  });
  const rejected = await prisma.annotationCase.findMany({
    where: { annotatorId: userId, status: CaseStatus.REJECTED },
    orderBy: { updatedAt: "desc" },
    include: {
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      ...caseNoteInclude,
    },
  });
  return { available, mine, rejected };
}
