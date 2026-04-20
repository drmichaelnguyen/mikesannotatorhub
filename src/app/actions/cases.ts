"use server";

import { CaseStatus, CompensationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { computeCompensation } from "@/lib/compensation";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { getReviewerNotificationRecipients, pushNotification } from "@/app/actions/notifications";
import { NOTIF } from "@/lib/notification-types";

const caseNoteInclude = {
  caseNotes: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
} as const;

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

function parseProjectList(raw: string): string[] {
  return [...new Set(raw.split(/[\n,;,]+/g).map((s) => s.trim()).filter(Boolean))];
}

export type CreateCaseActionResult =
  | {
      ok: true;
      created: number;
      skippedExisting: string[];
      duplicateInList: string[];
    }
  | { ok: false; error: "required" | "no_ids" | "limits" };

export type GuideListRow = {
  id: string;
  title: string;
  content: string;
};

export type TopicListRow = {
  id: string;
  name: string;
  description: string | null;
  projects: { id: string; redbrickProject: string }[];
};

export async function listGuidesAndTopics() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("auth");
  }
  const [guides, topics] = await Promise.all([
    prisma.guide.findMany({
      orderBy: [{ title: "asc" }],
      select: { id: true, title: true, content: true },
    }),
    prisma.topic.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        projects: {
          orderBy: { redbrickProject: "asc" },
          select: { id: true, redbrickProject: true },
        },
      },
    }),
  ]);
  return { guides, topics };
}

export async function createGuideAction(formData: FormData) {
  await requireRole("REVIEWER");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) {
    return { ok: false as const, error: "required" as const };
  }
  await prisma.guide.create({
    data: { title, content },
  });
  revalidatePath("/reviewer");
  return { ok: true as const };
}

export async function updateGuideAction(formData: FormData) {
  await requireRole("REVIEWER");
  const guideId = String(formData.get("guideId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!guideId || !title || !content) {
    return { ok: false as const, error: "required" as const };
  }
  const guide = await prisma.guide.findUnique({ where: { id: guideId }, select: { id: true } });
  if (!guide) {
    return { ok: false as const, error: "notfound" as const };
  }
  await prisma.guide.update({
    where: { id: guideId },
    data: { title, content },
  });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function deleteGuideAction(formData: FormData) {
  await requireRole("REVIEWER");
  const guideId = String(formData.get("guideId") ?? "").trim();
  if (!guideId) {
    return { ok: false as const, error: "required" as const };
  }
  const guide = await prisma.guide.findUnique({ where: { id: guideId }, select: { id: true } });
  if (!guide) {
    return { ok: false as const, error: "notfound" as const };
  }
  await prisma.guide.delete({ where: { id: guideId } });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function createTopicAction(formData: FormData) {
  await requireRole("REVIEWER");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const projects = parseProjectList(String(formData.get("projects") ?? ""));
  if (!name) {
    return { ok: false as const, error: "required" as const };
  }
  await prisma.topic.create({
    data: {
      name,
      description: description || null,
      projects: projects.length
        ? {
            create: projects.map((redbrickProject) => ({ redbrickProject })),
          }
        : undefined,
    },
  });
  revalidatePath("/reviewer");
  return { ok: true as const };
}

export async function createCaseAction(formData: FormData): Promise<CreateCaseActionResult> {
  await requireRole("REVIEWER");
  const rawIds = String(formData.get("caseIds") ?? "").trim();
  const { unique, duplicateTokens } = parseCaseIdBatch(rawIds);
  const duplicateInList = [...new Set(duplicateTokens)];

  const redbrickProject = String(formData.get("redbrickProject") ?? "").trim();
  const guideId = String(formData.get("guideId") ?? "").trim();
  const topicId = String(formData.get("topicId") ?? "").trim();
  const guideline = String(formData.get("guideline") ?? "").trim();
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
  const minMinutesPerCase = Number(formData.get("minMinutesPerCase"));
  const maxMinutesPerCase = Number(formData.get("maxMinutesPerCase"));
  const compensationType =
    String(formData.get("compensationType") ?? "") === "PER_MINUTE"
      ? CompensationType.PER_MINUTE
      : CompensationType.PER_CASE;
  const compensationAmount = Number(formData.get("compensationAmount"));

  let resolvedGuideline = guideline;
  if (guideId) {
    const guide = await prisma.guide.findUnique({
      where: { id: guideId },
      select: { id: true, content: true },
    });
    if (!guide) {
      return { ok: false as const, error: "required" };
    }
    if (!resolvedGuideline) {
      resolvedGuideline = guide.content;
    }
  }

  if (topicId) {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, projects: { select: { redbrickProject: true } } },
    });
    const linkedProjects = topic?.projects.map((p) => p.redbrickProject) ?? [];
    if (!topic || (linkedProjects.length > 0 && !linkedProjects.includes(redbrickProject))) {
      return { ok: false as const, error: "required" };
    }
  }

  if (
    !redbrickProject ||
    !resolvedGuideline ||
    !scopeOfWork ||
    !Number.isFinite(minMinutesPerCase) ||
    minMinutesPerCase <= 0 ||
    !Number.isFinite(maxMinutesPerCase) ||
    maxMinutesPerCase <= 0 ||
    !Number.isFinite(compensationAmount) ||
    compensationAmount < 0
  ) {
    return { ok: false as const, error: "required" };
  }

  if (Math.floor(minMinutesPerCase) > Math.floor(maxMinutesPerCase)) {
    return { ok: false as const, error: "limits" };
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
    guideId: guideId || null,
    topicId: topicId || null,
    guideline: resolvedGuideline,
    scopeOfWork,
    minMinutesPerCase: Math.floor(minMinutesPerCase),
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

    const createdRows = await prisma.annotationCase.findMany({
      where: { caseId: { in: toCreate } },
      select: { id: true, caseId: true },
    });

    if (annotatorId) {
      for (const row of createdRows) {
        await pushNotification([annotatorId], NOTIF.CASE_ASSIGNED, row.id, row.caseId);
      }
    } else {
      const allAnnotators = await prisma.user.findMany({
        where: { role: "ANNOTATOR" },
        select: { id: true },
      });
      const allIds = allAnnotators.map((u) => u.id);
      for (const row of createdRows) {
        await pushNotification(allIds, NOTIF.NEW_CASE, row.id, row.caseId);
      }
    }
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
  const updated = await prisma.annotationCase.updateMany({
    where: {
      id: caseDbId,
      status: CaseStatus.AVAILABLE,
      annotatorId: null,
    },
    data: {
      annotatorId: user.id,
      status: CaseStatus.ASSIGNED,
      assignedAt: new Date(),
      completedAt: null,
      annotationMinutes: null,
    },
  });
  if (updated.count !== 1) {
    return { ok: false as const, error: "state" as const };
  }
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

/** Reviewer assigns an unclaimed case to a specific annotator (exclusive). */
export async function reviewerAssignCaseAction(caseDbId: string, annotatorUserId: string) {
  await requireRole("REVIEWER");
  if (!annotatorUserId) {
    return { ok: false as const, error: "required" as const };
  }
  const target = await prisma.user.findUnique({ where: { id: annotatorUserId } });
  if (!target || target.role !== "ANNOTATOR") {
    return { ok: false as const, error: "invalid_annotator" as const };
  }
  const updated = await prisma.annotationCase.updateMany({
    where: {
      id: caseDbId,
      status: CaseStatus.AVAILABLE,
      annotatorId: null,
    },
    data: {
      annotatorId: target.id,
      status: CaseStatus.ASSIGNED,
      assignedAt: new Date(),
      completedAt: null,
      annotationMinutes: null,
    },
  });
  if (updated.count !== 1) {
    return { ok: false as const, error: "state" as const };
  }
  const assignedRow = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: { caseId: true },
  });
  if (assignedRow) {
    await pushNotification([target.id], NOTIF.CASE_ASSIGNED, caseDbId, assignedRow.caseId);
  }
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

/** Reviewer (admin) updates per-case compensation rate. */
export async function updateCaseCompensationAction(input: {
  caseDbId: string;
  compensationType: CompensationType;
  compensationAmount: number;
}) {
  await requireRole("REVIEWER");
  if (
    input.compensationType !== CompensationType.PER_MINUTE &&
    input.compensationType !== CompensationType.PER_CASE
  ) {
    return { ok: false as const, error: "required" as const };
  }
  if (!Number.isFinite(input.compensationAmount) || input.compensationAmount < 0) {
    return { ok: false as const, error: "required" as const };
  }
  const row = await prisma.annotationCase.findUnique({
    where: { id: input.caseDbId },
    select: { id: true },
  });
  if (!row) return { ok: false as const, error: "notfound" as const };

  await prisma.annotationCase.update({
    where: { id: input.caseDbId },
    data: {
      compensationType: input.compensationType,
      compensationAmount: input.compensationAmount,
    },
  });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function updateCaseDetailsAction(input: {
  caseDbId: string;
  caseId: string;
  status: CaseStatus;
  redbrickProject: string;
  guideId?: string | null;
  topicId?: string | null;
  guideline: string;
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
}) {
  await requireRole("REVIEWER");
  const caseId = input.caseId.trim();
  const redbrickProject = input.redbrickProject.trim();
  const guideId = input.guideId?.trim() || "";
  const topicId = input.topicId?.trim() || "";
  const guideline = input.guideline.trim();
  const scopeOfWork = input.scopeOfWork.trim();
  const minMinutesPerCase = Math.floor(input.minMinutesPerCase);
  const maxMinutesPerCase = Math.floor(input.maxMinutesPerCase);

  if (
    !caseId ||
    !redbrickProject ||
    !guideline ||
    !scopeOfWork ||
    !Number.isFinite(minMinutesPerCase) ||
    minMinutesPerCase <= 0 ||
    !Number.isFinite(maxMinutesPerCase) ||
    maxMinutesPerCase <= 0 ||
    !Number.isFinite(input.compensationAmount) ||
    input.compensationAmount < 0
  ) {
    return { ok: false as const, error: "required" as const };
  }

  if (minMinutesPerCase > maxMinutesPerCase) {
    return { ok: false as const, error: "limits" as const };
  }

  if (
    input.status !== CaseStatus.AVAILABLE &&
    input.status !== CaseStatus.ASSIGNED &&
    input.status !== CaseStatus.SUBMITTED &&
    input.status !== CaseStatus.ACCEPTED &&
    input.status !== CaseStatus.AUDITED &&
    input.status !== CaseStatus.REJECTED
  ) {
    return { ok: false as const, error: "required" as const };
  }

  if (
    input.compensationType !== CompensationType.PER_CASE &&
    input.compensationType !== CompensationType.PER_MINUTE
  ) {
    return { ok: false as const, error: "required" as const };
  }

  if (guideId) {
    const guide = await prisma.guide.findUnique({
      where: { id: guideId },
      select: { id: true },
    });
    if (!guide) {
      return { ok: false as const, error: "required" as const };
    }
  }

  if (topicId) {
    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, projects: { select: { redbrickProject: true } } },
    });
    const linkedProjects = topic?.projects.map((p) => p.redbrickProject) ?? [];
    if (!topic || (linkedProjects.length > 0 && !linkedProjects.includes(redbrickProject))) {
      return { ok: false as const, error: "required" as const };
    }
  }

  const row = await prisma.annotationCase.findUnique({
    where: { id: input.caseDbId },
    select: { id: true },
  });
  if (!row) return { ok: false as const, error: "notfound" as const };

  const dupe = await prisma.annotationCase.findFirst({
    where: {
      caseId,
      NOT: { id: input.caseDbId },
    },
    select: { id: true },
  });
  if (dupe) return { ok: false as const, error: "case_exists" as const };

  await prisma.annotationCase.update({
    where: { id: input.caseDbId },
    data: {
      caseId,
      status: input.status,
      redbrickProject,
      guideId: guideId || null,
      topicId: topicId || null,
      guideline,
      scopeOfWork,
      minMinutesPerCase,
      maxMinutesPerCase,
      compensationType: input.compensationType,
      compensationAmount: input.compensationAmount,
    },
  });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function listAnnotatorsForAssignment() {
  await requireRole("REVIEWER");
  return prisma.user.findMany({
    where: { role: "ANNOTATOR" },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

export async function submitAnnotationAction(
  caseDbId: string,
  minutes: number,
  difficultyRating: number,
) {
  const user = await requireRole("ANNOTATOR");
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false as const, error: "minutes" };
  }
  if (
    !Number.isInteger(difficultyRating) ||
    difficultyRating < 1 ||
    difficultyRating > 5
  ) {
    return { ok: false as const, error: "rating" as const };
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
      difficultyRating,
      completedAt: new Date(),
    },
  });
  const reviewerIds = await getReviewerNotificationRecipients();
  await pushNotification(reviewerIds, NOTIF.CASE_SUBMITTED, caseDbId, row.caseId);
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function reviewCaseAction(input: {
  caseDbId: string;
  decision: "ACCEPT" | "REJECT";
  comment: string;
  screenshotData: string | null;
  qualityRating: number;
}) {
  const reviewer = await requireRole("REVIEWER");
  if (
    !Number.isInteger(input.qualityRating) ||
    input.qualityRating < 1 ||
    input.qualityRating > 5
  ) {
    return { ok: false as const, error: "rating" as const };
  }
  const row = await prisma.annotationCase.findUnique({
    where: { id: input.caseDbId },
    include: { annotator: true },
  });
  if (!row || row.status !== CaseStatus.SUBMITTED) {
    return { ok: false as const, error: "state" };
  }

  const accept = input.decision === "ACCEPT";

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
      data: accept
        ? {
            status: CaseStatus.AUDITED,
            auditedAt: new Date(),
            auditedById: reviewer.id,
            qualityRating: input.qualityRating,
          }
        : {
            status: CaseStatus.REJECTED,
            auditedAt: null,
            auditedById: null,
            qualityRating: input.qualityRating,
          },
    }),
  ]);

  if (!accept && row.annotatorId) {
    await pushNotification([row.annotatorId], NOTIF.CASE_REJECTED, row.id, row.caseId);
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return {
    ok: true as const,
    payout: computeCompensation(
      row.compensationType,
      row.compensationAmount,
      row.annotationMinutes,
    ),
  };
}

export async function addCaseNoteAction(input: {
  caseDbId: string;
  content: string;
  imageDataList: string[];
  parentNoteId?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const row = await prisma.annotationCase.findUnique({ where: { id: input.caseDbId } });
  if (!row) return { ok: false as const, error: "notfound" as const };

  if (input.parentNoteId) {
    const parent = await prisma.caseNote.findUnique({
      where: { id: input.parentNoteId },
      select: { id: true, annotationCaseId: true },
    });
    if (!parent || parent.annotationCaseId !== row.id) {
      return { ok: false as const, error: "invalid_parent" as const };
    }
  }

  if (user.role === "ANNOTATOR") {
    if (row.annotatorId !== user.id) {
      return { ok: false as const, error: "forbidden" as const };
    }
  } else if (user.role !== "REVIEWER") {
    return { ok: false as const, error: "forbidden" as const };
  }

  const text = input.content.trim();
  const images = input.imageDataList.map((item) => item.trim()).filter(Boolean);
  if (!text && images.length === 0) {
    return { ok: false as const, error: "empty" as const };
  }

  await prisma.caseNote.create({
    data: {
      annotationCaseId: row.id,
      parentNoteId: input.parentNoteId ?? null,
      authorId: user.id,
      content: text || null,
      imageData: images[0] ?? null,
      imageDataListJson: images.length > 0 ? JSON.stringify(images) : null,
    },
  });

  if (user.role === "REVIEWER" && row.annotatorId) {
    await pushNotification([row.annotatorId], NOTIF.NEW_COMMENT, row.id, row.caseId);
  }
  if (user.role === "ANNOTATOR") {
    const reviewerIds = await getReviewerNotificationRecipients();
    await pushNotification(reviewerIds, NOTIF.NEW_COMMENT, row.id, row.caseId);
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function listCasesForReviewer() {
  await requireRole("REVIEWER");
  return prisma.annotationCase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      guide: true,
      topic: { include: { projects: true } },
      annotator: true,
      auditedBy: { select: { id: true, name: true, email: true } },
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
  auditedCount: number;
  totalCompensation: number;
};

export type AnnotatorCompensationSummary = {
  thisMonth: number;
  priorMonths: number;
  allTime: number;
  averageDifficulty: number | null;
  difficultyCount: number;
  averageQuality: number | null;
  qualityCount: number;
  projects: AnnotatorProjectRow[];
};

/** Audited (and legacy accepted) cases; month boundaries use the viewer's local calendar. */
export async function getAnnotatorCompensationSummary(): Promise<AnnotatorCompensationSummary> {
  const user = await requireRole("ANNOTATOR");
  const cases = await prisma.annotationCase.findMany({
    where: { annotatorId: user.id },
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
  let difficultyTotal = 0;
  let difficultyCount = 0;
  let qualityTotal = 0;
  let qualityCount = 0;
  const byProject = new Map<string, { auditedCount: number; totalCompensation: number }>();

  for (const c of cases) {
    if (c.difficultyRating != null) {
      difficultyTotal += c.difficultyRating;
      difficultyCount += 1;
    }
    if (c.qualityRating != null) {
      qualityTotal += c.qualityRating;
      qualityCount += 1;
    }

    if (c.status !== CaseStatus.AUDITED && c.status !== CaseStatus.ACCEPTED) {
      continue;
    }

    const amount = computeCompensation(
      c.compensationType,
      c.compensationAmount,
      c.annotationMinutes,
    );
    const acceptedAt = c.reviews[0]?.createdAt ?? c.auditedAt ?? c.updatedAt;

    if (acceptedAt >= startCurrent && acceptedAt < startNext) {
      thisMonth += amount;
    } else if (acceptedAt < startCurrent) {
      priorMonths += amount;
    } else {
      thisMonth += amount;
    }

    const key = c.redbrickProject.trim() || "—";
    const prev = byProject.get(key) ?? { auditedCount: 0, totalCompensation: 0 };
    prev.auditedCount += 1;
    prev.totalCompensation += amount;
    byProject.set(key, prev);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const projects = Array.from(byProject.entries())
    .map(([name, v]) => ({
      name,
      auditedCount: v.auditedCount,
      totalCompensation: round2(v.totalCompensation),
    }))
    .sort((a, b) => b.totalCompensation - a.totalCompensation);

  return {
    thisMonth: round2(thisMonth),
    priorMonths: round2(priorMonths),
    allTime: round2(thisMonth + priorMonths),
    averageDifficulty: difficultyCount > 0 ? round2(difficultyTotal / difficultyCount) : null,
    difficultyCount,
    averageQuality: qualityCount > 0 ? round2(qualityTotal / qualityCount) : null,
    qualityCount,
    projects,
  };
}

export async function listCasesForAnnotator(userId: string) {
  const available = await prisma.annotationCase.findMany({
    where: { status: CaseStatus.AVAILABLE },
    orderBy: { createdAt: "desc" },
    include: { guide: true, topic: { include: { projects: true } }, ...caseNoteInclude },
  });
  const mine = await prisma.annotationCase.findMany({
    where: {
      annotatorId: userId,
      status: {
        in: [CaseStatus.ASSIGNED, CaseStatus.SUBMITTED, CaseStatus.ACCEPTED, CaseStatus.AUDITED],
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      guide: true,
      topic: { include: { projects: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      auditedBy: { select: { id: true, name: true, email: true } },
      ...caseNoteInclude,
    },
  });
  const rejected = await prisma.annotationCase.findMany({
    where: { annotatorId: userId, status: CaseStatus.REJECTED },
    orderBy: { updatedAt: "desc" },
    include: {
      guide: true,
      topic: { include: { projects: true } },
      reviews: { orderBy: { createdAt: "desc" }, take: 1 },
      auditedBy: { select: { id: true, name: true, email: true } },
      ...caseNoteInclude,
    },
  });
  return { available, mine, rejected };
}
