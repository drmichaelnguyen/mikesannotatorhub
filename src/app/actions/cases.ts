"use server";

import { CaseStatus, CompensationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  compensationMonthKeyUtc,
  computeCaseBasePay,
  computeCompensation,
  computeTimeCompensation,
  resubmitPenaltyApplies,
  suggestedQualityAdjustment,
} from "@/lib/compensation";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { requireAnnotatorWorkspace, resolveAnnotatorWorkspaceUserId } from "@/lib/annotator-workspace";
import { getReviewerNotificationRecipients, pushNotification } from "@/app/actions/notifications";
import { NOTIF } from "@/lib/notification-types";
import { getCaseNoteImages } from "@/lib/case-note-images";
import { parseVideoGuideUrlsInput, videoGuideUrlsToDbColumn } from "@/lib/video-guides";
import { mapPrismaCaseTopics } from "@/lib/reviewer-serialize";
import {
  deleteContinuityReport,
  readContinuityReportsFromFormData,
  saveContinuityReport,
} from "@/lib/continuity-reports";

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

const MAX_SCOPE_WORDS = 12;
const TEMPLATE_ROW_MARKER_RE = /^\[\[TEMPLATE_ROW_(\d+)\]\]\s*(.*)$/;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function parseTopicIdsFromFormData(formData: FormData): string[] {
  const fromMulti = [
    ...new Set(formData.getAll("topicIds").map((v) => String(v).trim()).filter(Boolean)),
  ];
  if (fromMulti.length > 0) return fromMulti;
  const legacy = String(formData.get("topicId") ?? "").trim();
  return legacy ? [legacy] : [];
}

async function assertTopicsAllowedForCase(
  topicIds: string[],
  redbrickProject: string,
  scopeOfWork: string,
): Promise<boolean> {
  const unique = [...new Set(topicIds.filter(Boolean))];
  if (unique.length === 0) return true;
  const rows = await prisma.topic.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      projects: { select: { redbrickProject: true } },
      scopes: { select: { scopeOfWork: true } },
    },
  });
  if (rows.length !== unique.length) return false;
  for (const topic of rows) {
    const linkedProjects = topic.projects.map((p) => p.redbrickProject);
    const linkedScopes = topic.scopes.map((s) => s.scopeOfWork);
    if (
      (linkedProjects.length > 0 && !linkedProjects.includes(redbrickProject)) ||
      (linkedScopes.length > 0 && !linkedScopes.includes(scopeOfWork))
    ) {
      return false;
    }
  }
  return true;
}

async function hasCaseInstructionSource(
  scopeOfWork: string,
  guideId: string,
  topicIds: string[],
  guideline: string,
): Promise<boolean> {
  if (guideId || topicIds.length > 0 || guideline.trim()) return true;
  const scope = scopeOfWork.trim();
  if (!scope) return false;
  const scopeTemplate = await prisma.scopeOfWorkTemplate.findUnique({
    where: { scopeOfWork: scope },
    select: { template: true },
  });
  return Boolean(scopeTemplate?.template.trim());
}

export type CreateCaseActionResult =
  | {
      ok: true;
      created: number;
      skippedExisting: string[];
      duplicateInList: string[];
      continuityReportsAttached: number;
      continuityReportsUnmatched: string[];
    }
  | { ok: false; error: "required" | "no_ids" | "limits" | "scope_words" };

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
  scopes: { id: string; scopeOfWork: string }[];
};

export type ScopeOfWorkTemplateRow = {
  id: string;
  scopeOfWork: string;
  template: string;
};

export async function listGuidesAndTopicsLite() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("auth");
  }
  const [guides, topics] = await Promise.all([
    prisma.guide.findMany({
      orderBy: [{ title: "asc" }],
      select: { id: true, title: true },
    }),
    prisma.topic.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        projects: {
          orderBy: { redbrickProject: "asc" },
          select: { id: true, redbrickProject: true },
        },
        scopes: {
          orderBy: { scopeOfWork: "asc" },
          select: { id: true, scopeOfWork: true },
        },
      },
    }),
  ]);
  return { guides, topics };
}

export async function listGuidesForManager() {
  await requireRole("REVIEWER");
  return prisma.guide.findMany({
    orderBy: [{ title: "asc" }],
    select: { id: true, title: true, content: true },
  });
}

export async function listTopicsForManager() {
  await requireRole("REVIEWER");
  return prisma.topic.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      projects: {
        orderBy: { redbrickProject: "asc" },
        select: { id: true, redbrickProject: true },
      },
      scopes: {
        orderBy: { scopeOfWork: "asc" },
        select: { id: true, scopeOfWork: true },
      },
    },
  });
}

export async function getReviewerDashboardStats() {
  await requireRole("REVIEWER");
  const [caseRows, annotatorCount] = await Promise.all([
    prisma.annotationCase.findMany({
      select: {
        status: true,
        completedAt: true,
        difficultyRating: true,
        qualityRating: true,
      },
    }),
    prisma.user.count({ where: { role: "ANNOTATOR" } }),
  ]);
  const caseDone = caseRows.filter((c) => c.completedAt != null).length;
  const caseSubmittedPendingReview = caseRows.filter((c) => c.status === CaseStatus.SUBMITTED).length;
  const caseApproved = caseRows.filter(
    (c) => c.status === CaseStatus.AUDITED || c.status === CaseStatus.ACCEPTED,
  ).length;
  const difficultyRatings = caseRows.filter((c) => c.difficultyRating != null);
  const qualityRatings = caseRows.filter((c) => c.qualityRating != null);
  const avg = (
    list: { difficultyRating?: number | null; qualityRating?: number | null }[],
    key: "difficultyRating" | "qualityRating",
  ) => {
    const vals = list.map((item) => item[key]).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((sum, v) => sum + v, 0) / vals.length) * 10) / 10;
  };
  return {
    totalAnnotators: annotatorCount,
    caseDone,
    caseSubmittedPendingReview,
    caseApproved,
    averageDifficulty: avg(caseRows, "difficultyRating"),
    difficultyCount: difficultyRatings.length,
    averageQuality: avg(caseRows, "qualityRating"),
    qualityCount: qualityRatings.length,
  };
}

export async function getGuideContentAction(guideId: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("auth");
  }
  const guide = await prisma.guide.findUnique({
    where: { id: guideId },
    select: { content: true },
  });
  return guide?.content ?? "";
}

export async function getTopicDetailAction(topicId: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("auth");
  }
  return prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      name: true,
      description: true,
      projects: {
        orderBy: { redbrickProject: "asc" },
        select: { id: true, redbrickProject: true },
      },
      scopes: {
        orderBy: { scopeOfWork: "asc" },
        select: { id: true, scopeOfWork: true },
      },
    },
  });
}

export async function listReviewerCaseFilterOptions() {
  await requireRole("REVIEWER");
  const rows = await prisma.annotationCase.findMany({
    select: { scopeOfWork: true, redbrickProject: true },
  });
  const scopeOptions = Array.from(
    new Set(rows.map((c) => c.scopeOfWork.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const rbProjectOptions = Array.from(
    new Set(rows.map((c) => c.redbrickProject.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  return { scopeOptions, rbProjectOptions };
}

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
        scopes: {
          orderBy: { scopeOfWork: "asc" },
          select: { id: true, scopeOfWork: true },
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
  const projects = [...new Set(formData.getAll("projects").map((v) => String(v).trim()).filter(Boolean))];
  const scopes = [...new Set(formData.getAll("scopes").map((v) => String(v).trim()).filter(Boolean))];
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
      scopes: scopes.length
        ? {
            create: scopes.map((scopeOfWork) => ({ scopeOfWork })),
          }
        : undefined,
    },
  });
  revalidatePath("/reviewer");
  return { ok: true as const };
}

export async function updateTopicAction(formData: FormData) {
  await requireRole("REVIEWER");
  const topicId = String(formData.get("topicId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const projects = [...new Set(formData.getAll("projects").map((v) => String(v).trim()).filter(Boolean))];
  const scopes = [...new Set(formData.getAll("scopes").map((v) => String(v).trim()).filter(Boolean))];
  if (!topicId || !name) {
    return { ok: false as const, error: "required" as const };
  }
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { id: true },
  });
  if (!topic) {
    return { ok: false as const, error: "notfound" as const };
  }
  await prisma.$transaction([
    prisma.topic.update({
      where: { id: topicId },
      data: {
        name,
        description: description || null,
      },
    }),
    prisma.topicProject.deleteMany({
      where: { topicId },
    }),
    prisma.topicScope.deleteMany({
      where: { topicId },
    }),
    prisma.topicProject.createMany({
      data: projects.map((redbrickProject) => ({ topicId, redbrickProject })),
    }),
    prisma.topicScope.createMany({
      data: scopes.map((scopeOfWork) => ({ topicId, scopeOfWork })),
    }),
  ]);
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function listScopeOfWorkTemplatesAction(): Promise<ScopeOfWorkTemplateRow[]> {
  await requireRole("REVIEWER");
  return prisma.scopeOfWorkTemplate.findMany({
    orderBy: { scopeOfWork: "asc" },
    select: { id: true, scopeOfWork: true, template: true },
  });
}

export async function upsertScopeOfWorkTemplateAction(formData: FormData): Promise<
  | { ok: true }
  | { ok: false; error: "required" | "scope_words" }
> {
  await requireRole("REVIEWER");
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
  const template = String(formData.get("template") ?? "").trim();
  if (!scopeOfWork || !template) return { ok: false as const, error: "required" as const };
  if (countWords(scopeOfWork) > MAX_SCOPE_WORDS) {
    return { ok: false as const, error: "scope_words" as const };
  }

  await prisma.scopeOfWorkTemplate.upsert({
    where: { scopeOfWork },
    create: { scopeOfWork, template },
    update: { template },
  });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function deleteScopeOfWorkTemplateAction(formData: FormData): Promise<
  | { ok: true }
  | { ok: false; error: "required" | "notfound" }
> {
  await requireRole("REVIEWER");
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
  if (!scopeOfWork) return { ok: false as const, error: "required" as const };
  const row = await prisma.scopeOfWorkTemplate.findUnique({ where: { scopeOfWork }, select: { id: true } });
  if (!row) return { ok: false as const, error: "notfound" as const };

  await prisma.scopeOfWorkTemplate.delete({ where: { scopeOfWork } });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function createCaseAction(formData: FormData): Promise<CreateCaseActionResult> {
  await requireRole("REVIEWER");
  const rawIds = String(formData.get("caseIds") ?? "").trim();
  const { unique, duplicateTokens } = parseCaseIdBatch(rawIds);
  const duplicateInList = [...new Set(duplicateTokens)];

  const redbrickProject = String(formData.get("redbrickProject") ?? "").trim();
  const guideId = String(formData.get("guideId") ?? "").trim();
  const topicIds = parseTopicIdsFromFormData(formData);
  const guideline = String(formData.get("guideline") ?? "").trim();
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
  const minMinutesPerCase = Number(formData.get("minMinutesPerCase"));
  const maxMinutesPerCase = Number(formData.get("maxMinutesPerCase"));
  const compensationType =
    String(formData.get("compensationType") ?? "") === "PER_MINUTE"
      ? CompensationType.PER_MINUTE
      : CompensationType.PER_CASE;
  const compensationAmount = Number(formData.get("compensationAmount"));
  const videoGuideUrls = parseVideoGuideUrlsInput(String(formData.get("videoGuideUrls") ?? ""));

  const normalizedGuideline = guideline;
  if (guideId) {
    const guide = await prisma.guide.findUnique({
      where: { id: guideId },
      select: { id: true },
    });
    if (!guide) {
      return { ok: false as const, error: "required" };
    }
  }

  const topicsAllowed = await assertTopicsAllowedForCase(topicIds, redbrickProject, scopeOfWork);
  if (!topicsAllowed) {
    return { ok: false as const, error: "required" };
  }

  const hasInstructionSource = await hasCaseInstructionSource(
    scopeOfWork,
    guideId,
    topicIds,
    normalizedGuideline,
  );

  if (
    !redbrickProject ||
    !hasInstructionSource ||
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
  if (countWords(scopeOfWork) > MAX_SCOPE_WORDS) {
    return { ok: false as const, error: "scope_words" };
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
    where: {
      caseId: { in: unique },
      scopeOfWork,
    },
    select: { caseId: true },
  });
  const existingSet = new Set(existingRows.map((r) => r.caseId));
  const skippedExisting = unique.filter((id) => existingSet.has(id));
  const toCreate = unique.filter((id) => !existingSet.has(id));

  const base = {
    redbrickProject,
    guideId: guideId || null,
    guideline: normalizedGuideline,
    scopeOfWork,
    minMinutesPerCase: Math.floor(minMinutesPerCase),
    maxMinutesPerCase: Math.floor(maxMinutesPerCase),
    compensationType,
    compensationAmount,
    annotatorBonus: 0,
    videoGuideUrls: videoGuideUrlsToDbColumn(videoGuideUrls),
    annotatorId,
    status,
    assignedAt,
  };

  let created = 0;
  const { byCaseId: continuityReportsByCaseId, unmatchedFilenames: continuityReportsUnmatched } =
    await readContinuityReportsFromFormData(formData, unique);
  let continuityReportsAttached = 0;

  if (toCreate.length > 0) {
    const res = await prisma.annotationCase.createMany({
      data: toCreate.map((caseId) => ({ ...base, caseId })),
    });
    created = res.count;

    const createdRows = await prisma.annotationCase.findMany({
      where: { caseId: { in: toCreate }, scopeOfWork },
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

    const uniqueTopicIds = [...new Set(topicIds.filter(Boolean))];
    if (uniqueTopicIds.length > 0 && createdRows.length > 0) {
      await prisma.annotationCaseTopic.createMany({
        data: createdRows.flatMap((row) =>
          uniqueTopicIds.map((topicId) => ({ annotationCaseId: row.id, topicId })),
        ),
      });
    }
  }

  const rowsForReports = await prisma.annotationCase.findMany({
    where: {
      caseId: { in: [...continuityReportsByCaseId.keys()] },
      scopeOfWork,
    },
    select: { id: true, caseId: true },
  });
  for (const row of rowsForReports) {
    const content = continuityReportsByCaseId.get(row.caseId);
    if (!content) continue;
    await saveContinuityReport(row.id, content);
    await prisma.annotationCase.update({
      where: { id: row.id },
      data: { hasContinuityReport: true },
    });
    continuityReportsAttached += 1;
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return {
    ok: true as const,
    created,
    skippedExisting,
    duplicateInList,
    continuityReportsAttached,
    continuityReportsUnmatched,
  };
}

async function annotatorHasPendingReviewAcknowledgment(annotatorUserId: string): Promise<boolean> {
  const rows = await prisma.annotationCase.findMany({
    where: {
      annotatorId: annotatorUserId,
      isReference: false,
      status: { in: [CaseStatus.REJECTED, CaseStatus.AUDITED, CaseStatus.ACCEPTED] },
    },
    select: {
      annotatorAcknowledgedReviewId: true,
      reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
    },
  });
  return rows.some((r) => r.reviews[0] && r.reviews[0].id !== r.annotatorAcknowledgedReviewId);
}

/** True when the annotator holds a case they have not submitted yet. */
async function annotatorHasUnsubmittedCase(annotatorUserId: string): Promise<boolean> {
  const count = await prisma.annotationCase.count({
    where: {
      annotatorId: annotatorUserId,
      isReference: false,
      status: CaseStatus.ASSIGNED,
    },
  });
  return count > 0;
}

export async function assignCaseAction(caseDbId: string) {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  if (await annotatorHasPendingReviewAcknowledgment(workspaceUserId)) {
    return { ok: false as const, error: "pending_review_ack" as const };
  }
  if (await annotatorHasUnsubmittedCase(workspaceUserId)) {
    return { ok: false as const, error: "active_case" as const };
  }
  const updated = await prisma.annotationCase.updateMany({
    where: {
      id: caseDbId,
      status: CaseStatus.AVAILABLE,
      annotatorId: null,
      isReference: false,
    },
    data: {
      annotatorId: workspaceUserId,
      status: CaseStatus.ASSIGNED,
      assignedAt: new Date(),
      completedAt: null,
      annotationMinutes: null,
      annotatorAcknowledgedReviewId: null,
    },
  });
  if (updated.count !== 1) {
    return { ok: false as const, error: "state" as const };
  }
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export type PendingReviewAckCase = {
  caseDbId: string;
  caseId: string;
  redbrickProject: string;
  status: CaseStatus;
  qualityRating: number | null;
  review: { id: string; decision: string; comment: string | null; createdAt: string };
};

/** Cases where the annotator must read reviewer feedback before self-claiming another case from the pool. */
export async function getAnnotatorPendingReviewAcknowledgments(): Promise<PendingReviewAckCase[]> {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const rows = await prisma.annotationCase.findMany({
    where: {
      annotatorId: workspaceUserId,
      isReference: false,
      status: { in: [CaseStatus.REJECTED, CaseStatus.AUDITED, CaseStatus.ACCEPTED] },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      caseId: true,
      redbrickProject: true,
      status: true,
      qualityRating: true,
      annotatorAcknowledgedReviewId: true,
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, decision: true, comment: true, createdAt: true },
      },
    },
  });
  return rows
    .filter((r) => r.reviews[0] && r.reviews[0].id !== r.annotatorAcknowledgedReviewId)
    .map((r) => {
      const rev = r.reviews[0]!;
      return {
        caseDbId: r.id,
        caseId: r.caseId,
        redbrickProject: r.redbrickProject,
        status: r.status,
        qualityRating: r.qualityRating,
        review: {
          id: rev.id,
          decision: rev.decision,
          comment: rev.comment,
          createdAt: rev.createdAt.toISOString(),
        },
      };
    })
    .sort((a, b) => {
      const t = new Date(b.review.createdAt).getTime() - new Date(a.review.createdAt).getTime();
      if (t !== 0) return t;
      return b.caseDbId.localeCompare(a.caseDbId);
    });
}

export async function acknowledgeAnnotatorReviewAction(caseDbId: string) {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: { id: true, annotatorId: true, isReference: true },
  });
  if (!row || row.isReference || row.annotatorId !== workspaceUserId) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const latest = await prisma.review.findFirst({
    where: { annotationCaseId: caseDbId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) {
    return { ok: false as const, error: "notfound" as const };
  }
  await prisma.annotationCase.update({
    where: { id: caseDbId },
    data: { annotatorAcknowledgedReviewId: latest.id },
  });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function unassignCaseAction(caseDbId: string) {
  const { user, workspaceUserId } = await requireAnnotatorWorkspace();
  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: { id: true, annotatorId: true, status: true, isReference: true },
  });
  if (!row || row.isReference) {
    return { ok: false as const, error: "state" as const };
  }
  if (!row.annotatorId) {
    return { ok: false as const, error: "state" as const };
  }
  if (
    user.role !== "REVIEWER" &&
    (row.annotatorId !== workspaceUserId || row.status !== CaseStatus.ASSIGNED)
  ) {
    return { ok: false as const, error: "forbidden" as const };
  }

  await prisma.annotationCase.update({
    where: { id: caseDbId },
    data: {
      status: CaseStatus.AVAILABLE,
      annotatorId: null,
      assignedAt: null,
      completedAt: null,
      annotationMinutes: null,
      difficultyRating: null,
      auditedAt: null,
      auditedById: null,
      qualityRating: null,
      annotatorAcknowledgedReviewId: null,
    },
  });

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
  if (await annotatorHasPendingReviewAcknowledgment(target.id)) {
    return { ok: false as const, error: "pending_review_ack" as const };
  }
  if (await annotatorHasUnsubmittedCase(target.id)) {
    return { ok: false as const, error: "active_case" as const };
  }
  const updated = await prisma.annotationCase.updateMany({
    where: {
      id: caseDbId,
      status: CaseStatus.AVAILABLE,
      annotatorId: null,
      isReference: false,
    },
    data: {
      annotatorId: target.id,
      status: CaseStatus.ASSIGNED,
      assignedAt: new Date(),
      completedAt: null,
      annotationMinutes: null,
      annotatorAcknowledgedReviewId: null,
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

/** Reviewer removes a case from the pool when no annotator has claimed it yet. */
export async function deleteCaseAction(caseDbId: string) {
  await requireRole("REVIEWER");
  const deleted = await prisma.annotationCase.deleteMany({
    where: {
      id: caseDbId,
      status: CaseStatus.AVAILABLE,
      annotatorId: null,
    },
  });
  if (deleted.count !== 1) {
    return { ok: false as const, error: "state" as const };
  }
  await deleteContinuityReport(caseDbId);
  await prisma.notification.deleteMany({ where: { annotationCaseId: caseDbId } });
  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

/** Reviewer (admin) updates per-case compensation rate. */
export async function updateCaseCompensationAction(input: {
  caseDbId: string;
  compensationType: CompensationType;
  compensationAmount: number;
  annotatorBonus: number;
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
  if (!Number.isFinite(input.annotatorBonus)) {
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
      annotatorBonus: input.annotatorBonus,
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
  topicIds: string[];
  guideline: string;
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
  annotatorBonus: number;
  isReference: boolean;
  videoGuideUrls: string[];
}) {
  await requireRole("REVIEWER");
  const caseId = input.caseId.trim();
  const redbrickProject = input.redbrickProject.trim();
  const guideId = input.guideId?.trim() || "";
  const topicIds = [...new Set(input.topicIds.map((id) => id.trim()).filter(Boolean))];
  const guideline = input.guideline.trim();
  const scopeOfWork = input.scopeOfWork.trim();
  const minMinutesPerCase = Math.floor(input.minMinutesPerCase);
  const maxMinutesPerCase = Math.floor(input.maxMinutesPerCase);

  const hasInstructionSource = await hasCaseInstructionSource(
    scopeOfWork,
    guideId,
    topicIds,
    guideline,
  );

  if (
    !caseId ||
    !redbrickProject ||
    !hasInstructionSource ||
    !scopeOfWork ||
    !Number.isFinite(minMinutesPerCase) ||
    minMinutesPerCase <= 0 ||
    !Number.isFinite(maxMinutesPerCase) ||
    maxMinutesPerCase <= 0 ||
    !Number.isFinite(input.compensationAmount) ||
    input.compensationAmount < 0 ||
    !Number.isFinite(input.annotatorBonus) ||
    input.annotatorBonus < 0
  ) {
    return { ok: false as const, error: "required" as const };
  }

  if (minMinutesPerCase > maxMinutesPerCase) {
    return { ok: false as const, error: "limits" as const };
  }
  if (countWords(scopeOfWork) > MAX_SCOPE_WORDS) {
    return { ok: false as const, error: "scope_words" as const };
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

  if (!(await assertTopicsAllowedForCase(topicIds, redbrickProject, scopeOfWork))) {
    return { ok: false as const, error: "required" as const };
  }

  const row = await prisma.annotationCase.findUnique({
    where: { id: input.caseDbId },
    select: { id: true },
  });
  if (!row) return { ok: false as const, error: "notfound" as const };

  const dupe = await prisma.annotationCase.findFirst({
    where: {
      caseId,
      scopeOfWork,
      NOT: { id: input.caseDbId },
    },
    select: { id: true },
  });
  if (dupe) return { ok: false as const, error: "case_exists" as const };

  const releaseAssignment =
    input.status === CaseStatus.AVAILABLE
      ? {
          annotatorId: null,
          assignedAt: null,
          completedAt: null,
          annotationMinutes: null,
          difficultyRating: null,
          auditedAt: null,
          auditedById: null,
          qualityRating: null,
        }
      : {};

  await prisma.$transaction(async (tx) => {
    await tx.annotationCase.update({
      where: { id: input.caseDbId },
      data: {
        caseId,
        status: input.status,
        redbrickProject,
        guideId: guideId || null,
        guideline,
        scopeOfWork,
        minMinutesPerCase,
        maxMinutesPerCase,
        compensationType: input.compensationType,
        compensationAmount: input.compensationAmount,
        annotatorBonus: input.annotatorBonus,
        isReference: input.isReference,
        videoGuideUrls: videoGuideUrlsToDbColumn(
          parseVideoGuideUrlsInput(input.videoGuideUrls.join("\n")),
        ),
        ...releaseAssignment,
      },
    });
    await tx.annotationCaseTopic.deleteMany({ where: { annotationCaseId: input.caseDbId } });
    if (topicIds.length > 0) {
      await tx.annotationCaseTopic.createMany({
        data: topicIds.map((topicId) => ({ annotationCaseId: input.caseDbId, topicId })),
      });
    }
  });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function updateCaseReferenceAction(input: {
  caseDbId: string;
  isReference: boolean;
}) {
  await requireRole("REVIEWER");
  const caseDbId = input.caseDbId.trim();
  if (!caseDbId) return { ok: false as const, error: "required" as const };

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: { id: true },
  });
  if (!row) return { ok: false as const, error: "notfound" as const };

  await prisma.annotationCase.update({
    where: { id: caseDbId },
    data: { isReference: input.isReference },
  });

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function batchUpdateCasesAction(input: {
  caseDbIds: string[];
  redbrickProject: string;
  guideId?: string | null;
  topicIds: string[];
  guideline: string;
  videoGuideUrls: string[];
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
  annotatorBonus: number;
}) {
  await requireRole("REVIEWER");
  const caseDbIds = [...new Set(input.caseDbIds.map((id) => id.trim()).filter(Boolean))];
  const redbrickProject = input.redbrickProject.trim();
  const guideId = input.guideId?.trim() || "";
  const topicIds = [...new Set(input.topicIds.map((id) => id.trim()).filter(Boolean))];
  const guideline = input.guideline.trim();
  const scopeOfWork = input.scopeOfWork.trim();
  const minMinutesPerCase = Math.floor(input.minMinutesPerCase);
  const maxMinutesPerCase = Math.floor(input.maxMinutesPerCase);

  if (caseDbIds.length === 0) {
    return { ok: false as const, error: "no_cases" as const };
  }

  const hasInstructionSource = await hasCaseInstructionSource(
    scopeOfWork,
    guideId,
    topicIds,
    guideline,
  );

  if (
    !redbrickProject ||
    !hasInstructionSource ||
    !scopeOfWork ||
    !Number.isFinite(minMinutesPerCase) ||
    minMinutesPerCase <= 0 ||
    !Number.isFinite(maxMinutesPerCase) ||
    maxMinutesPerCase <= 0 ||
    !Number.isFinite(input.compensationAmount) ||
    input.compensationAmount < 0 ||
    !Number.isFinite(input.annotatorBonus) ||
    input.annotatorBonus < 0
  ) {
    return { ok: false as const, error: "required" as const };
  }
  if (minMinutesPerCase > maxMinutesPerCase) {
    return { ok: false as const, error: "limits" as const };
  }
  if (countWords(scopeOfWork) > MAX_SCOPE_WORDS) {
    return { ok: false as const, error: "scope_words" as const };
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

  if (!(await assertTopicsAllowedForCase(topicIds, redbrickProject, scopeOfWork))) {
    return { ok: false as const, error: "required" as const };
  }

  const rows = await prisma.annotationCase.findMany({
    where: { id: { in: caseDbIds } },
    select: { id: true },
  });
  if (rows.length !== caseDbIds.length) {
    return { ok: false as const, error: "no_cases" as const };
  }

  const videoGuideUrlsCol = videoGuideUrlsToDbColumn(
    parseVideoGuideUrlsInput(input.videoGuideUrls.join("\n")),
  );

  await prisma.annotationCase.updateMany({
    where: { id: { in: caseDbIds } },
    data: {
      redbrickProject,
      guideId: guideId || null,
      guideline,
      videoGuideUrls: videoGuideUrlsCol,
      scopeOfWork,
      minMinutesPerCase,
      maxMinutesPerCase,
      compensationType: input.compensationType,
      compensationAmount: input.compensationAmount,
      annotatorBonus: input.annotatorBonus,
    },
  });

  await prisma.annotationCaseTopic.deleteMany({ where: { annotationCaseId: { in: caseDbIds } } });
  if (topicIds.length > 0) {
    await prisma.annotationCaseTopic.createMany({
      data: caseDbIds.flatMap((annotationCaseId) =>
        topicIds.map((topicId) => ({ annotationCaseId, topicId })),
      ),
    });
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const, updated: caseDbIds.length };
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
  const { user, workspaceUserId } = await requireAnnotatorWorkspace();
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
  if (!row || row.annotatorId !== workspaceUserId) {
    return { ok: false as const, error: "forbidden" };
  }
  if (row.isReference) {
    return { ok: false as const, error: "forbidden" };
  }
  if (row.status !== CaseStatus.ASSIGNED && row.status !== CaseStatus.REJECTED) {
    return { ok: false as const, error: "state" };
  }
  const template = await prisma.scopeOfWorkTemplate.findUnique({
    where: { scopeOfWork: row.scopeOfWork.trim() },
    select: { template: true },
  });
  const templateRows = (template?.template ?? "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (templateRows.length > 0) {
    const notes = await prisma.caseNote.findMany({
      where: {
        annotationCaseId: row.id,
        authorId: user.id,
      },
      select: {
        content: true,
        imageData: true,
        imageDataListJson: true,
      },
    });
    const coveredRows = new Set<number>();
    for (const note of notes) {
      const content = note.content?.trim() ?? "";
      const match = content.match(TEMPLATE_ROW_MARKER_RE);
      if (!match) continue;
      const index = Number(match[1]) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= templateRows.length) continue;
      const value = (match[2] ?? "").trim();
      if (!value) continue;
      coveredRows.add(index);
    }
    if (coveredRows.size !== templateRows.length) {
      const missingTemplateFields = templateRows.filter((_, index) => !coveredRows.has(index));
      return {
        ok: false as const,
        error: "template" as const,
        missingTemplateFields,
      };
    }
  }
  const isResubmit = row.status === CaseStatus.REJECTED;
  const totalMinutes = isResubmit
    ? (row.annotationMinutes ?? 0) + Math.floor(minutes)
    : Math.floor(minutes);
  await prisma.annotationCase.update({
    where: { id: caseDbId },
    data: {
      status: CaseStatus.SUBMITTED,
      annotationMinutes: totalMinutes,
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
  annotatorBonus?: number;
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
  let approvedBonus = 0;
  if (accept) {
    if (input.annotatorBonus != null) {
      if (!Number.isFinite(input.annotatorBonus)) {
        return { ok: false as const, error: "bonus" as const };
      }
      approvedBonus = input.annotatorBonus;
    } else {
      const caseBase = computeCaseBasePay(
        row.compensationType,
        row.compensationAmount,
        row.minMinutesPerCase,
        row.maxMinutesPerCase,
      );
      const priorReject = await prisma.review.findFirst({
        where: { annotationCaseId: row.id, decision: "REJECT" },
        select: { id: true },
      });
      approvedBonus = suggestedQualityAdjustment(input.qualityRating, caseBase, {
        wasResubmitted: priorReject != null,
        at: new Date(),
      });
    }
  }

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
            annotatorBonus: approvedBonus,
          }
        : {
            status: CaseStatus.REJECTED,
            auditedAt: null,
            auditedById: null,
            qualityRating: input.qualityRating,
            annotatorBonus: 0,
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
    payout: accept
      ? computeCompensation(
          row.compensationType,
          row.compensationAmount,
          row.annotationMinutes,
          row.maxMinutesPerCase,
          row.minMinutesPerCase,
          approvedBonus,
        )
      : 0,
  };
}

export async function addCaseNoteAction(input: {
  caseDbId: string;
  content: string;
  imageDataList: string[];
  parentNoteId?: string | null;
  isQuestion?: boolean;
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

  const workspaceUserId = await resolveAnnotatorWorkspaceUserId(user);
  if (user.role !== "REVIEWER") {
    if (!row.isReference && row.annotatorId !== workspaceUserId) {
      return { ok: false as const, error: "forbidden" as const };
    }
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
      isQuestion: input.isQuestion === true,
    },
  });

  if (user.role === "REVIEWER" && row.isReference) {
    const allAnnotators = await prisma.user.findMany({
      where: { role: "ANNOTATOR" },
      select: { id: true },
    });
    await pushNotification(
      allAnnotators.map((annotator) => annotator.id),
      NOTIF.NEW_COMMENT,
      row.id,
      row.caseId,
    );
  } else if (
    user.role === "REVIEWER" &&
    row.annotatorId &&
    row.annotatorId !== workspaceUserId
  ) {
    await pushNotification([row.annotatorId], NOTIF.NEW_COMMENT, row.id, row.caseId);
  }
  if (!row.isReference && row.annotatorId === workspaceUserId) {
    const reviewerIds = await getReviewerNotificationRecipients();
    await pushNotification(reviewerIds, NOTIF.NEW_COMMENT, row.id, row.caseId);
  }

  revalidatePath("/reviewer");
  revalidatePath("/annotator");
  return { ok: true as const };
}

export async function listCaseNotesAction(caseDbId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "auth" as const };

  const row = await prisma.annotationCase.findUnique({
    where: { id: caseDbId },
    select: {
      id: true,
      annotatorId: true,
      isReference: true,
      caseNotes: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!row) return { ok: false as const, error: "notfound" as const };

  const workspaceUserId = await resolveAnnotatorWorkspaceUserId(user);
  if (user.role !== "REVIEWER") {
    if (!row.isReference && row.annotatorId !== workspaceUserId) {
      return { ok: false as const, error: "forbidden" as const };
    }
  }

  return {
    ok: true as const,
    viewerId: user.id,
    notes: row.caseNotes.map((note) => ({
      id: note.id,
      parentNoteId: note.parentNoteId,
      content: note.content,
      images: getCaseNoteImages(note),
      isQuestion: note.isQuestion,
      createdAt: note.createdAt.toISOString(),
      author: { id: note.author.id, name: note.author.name, role: note.author.role },
    })),
  };
}

export async function listCasesForReviewer() {
  await requireRole("REVIEWER");
  return prisma.annotationCase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      guide: { select: { id: true, title: true } },
      ...caseTopicIncludeLite,
      annotator: { select: { id: true, name: true, email: true } },
      auditedBy: { select: { id: true, name: true, email: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, decision: true, comment: true, createdAt: true },
      },
      _count: {
        select: {
          caseNotes: true,
          reviews: { where: { decision: "REJECT" } },
        },
      },
    },
  });
}

export async function getAnnotatorBoard() {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  return listCasesForAnnotator(workspaceUserId);
}

export type AnnotatorProjectRow = {
  name: string;
  auditedCount: number;
  baseCompensation: number;
  bonusCompensation: number;
  totalCompensation: number;
};

export type AnnotatorCompensationCaseRow = {
  caseDbId: string;
  caseId: string;
  project: string;
  submittedAt: string | null;
  compensationType: "PER_MINUTE" | "PER_CASE";
  compensationAmount: number;
  annotationMinutes: number | null;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  wasResubmitted: boolean;
  baseCompensation: number;
  bonusCompensation: number;
  totalCompensation: number;
};

export type AnnotatorCompensationMonthRow = {
  monthKey: string;
  baseCompensation: number;
  bonusCompensation: number;
  totalCompensation: number;
  auditedCount: number;
  /** Sum of submitted annotation minutes for audited cases in the month. */
  totalMinutes: number;
  /** Total compensation ÷ hours worked; null when no time was recorded. */
  averagePayPerHour: number | null;
  cases: AnnotatorCompensationCaseRow[];
};

export type AnnotatorCompensationSummary = {
  thisMonth: number;
  priorMonths: number;
  allTime: number;
  baseAllTime: number;
  bonusAllTime: number;
  auditedCount: number;
  averageDifficulty: number | null;
  difficultyCount: number;
  averageQuality: number | null;
  qualityCount: number;
  projects: AnnotatorProjectRow[];
  history: AnnotatorCompensationMonthRow[];
};

export type AnnotatorAvailabilityDay = {
  day: string;
  availableHours: number;
};

export type AnnotatorAvailabilitySummary = {
  days: AnnotatorAvailabilityDay[];
  availableHours: number;
  assignedEstimateHours: number;
  remainingHours: number;
  assignedCaseCount: number;
};

export type AnnotatorCapacityWindow = {
  key: "24h" | "72h" | "7d";
  days: number;
  availableHours: number;
  assignedEstimateHours: number;
  remainingHours: number;
};

export type AnnotatorCapacityRow = {
  id: string;
  name: string;
  email: string;
  windows: AnnotatorCapacityWindow[];
  days: AnnotatorAvailabilityDay[];
};

function getNextSevenDays() {
  const today = new Date();
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function estimateCaseHours(c: {
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
}) {
  return ((c.minMinutesPerCase + c.maxMinutesPerCase) / 2) / 60;
}

function buildAvailabilitySummary(
  days: string[],
  rows: { day: string; availableHours: number }[],
  assignedCases: { minMinutesPerCase: number; maxMinutesPerCase: number }[],
): AnnotatorAvailabilitySummary {
  const byDay = new Map(rows.map((r) => [r.day, r.availableHours] as const));
  const normalizedDays = days.map((day) => ({ day, availableHours: round1(byDay.get(day) ?? 0) }));
  const availableHours = round1(normalizedDays.reduce((sum, d) => sum + d.availableHours, 0));
  const assignedEstimateHours = round1(
    assignedCases.reduce((sum, c) => sum + estimateCaseHours(c), 0),
  );
  return {
    days: normalizedDays,
    availableHours,
    assignedEstimateHours,
    remainingHours: round1(availableHours - assignedEstimateHours),
    assignedCaseCount: assignedCases.length,
  };
}

function buildCapacityWindows(
  days: string[],
  rows: { day: string; availableHours: number }[],
  assignedCases: { minMinutesPerCase: number; maxMinutesPerCase: number }[],
): AnnotatorCapacityWindow[] {
  const windows: AnnotatorCapacityWindow[] = [
    { key: "24h", days: 1, availableHours: 0, assignedEstimateHours: 0, remainingHours: 0 },
    { key: "72h", days: 3, availableHours: 0, assignedEstimateHours: 0, remainingHours: 0 },
    { key: "7d", days: 7, availableHours: 0, assignedEstimateHours: 0, remainingHours: 0 },
  ];
  const byDay = new Map(rows.map((r) => [r.day, r.availableHours] as const));
  for (const window of windows) {
    const selectedDays = days.slice(0, window.days);
    const availableHours = selectedDays.reduce((sum, day) => sum + (byDay.get(day) ?? 0), 0);
    const assignedEstimateHours =
      assignedCases.reduce((sum, c) => sum + estimateCaseHours(c), 0);
    window.availableHours = round1(availableHours);
    window.assignedEstimateHours = round1(assignedEstimateHours);
    window.remainingHours = round1(window.availableHours - window.assignedEstimateHours);
  }
  return windows;
}

/** Audited (and legacy accepted) cases; month boundaries use UTC calendar months. */
export async function getAnnotatorCompensationSummary(): Promise<AnnotatorCompensationSummary> {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const cases = await prisma.annotationCase.findMany({
    where: { annotatorId: workspaceUserId, isReference: false },
    include: {
      reviews: {
        where: { decision: "ACCEPT" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { reviews: { where: { decision: "REJECT" } } },
      },
    },
  });

  const now = new Date();
  const thisMonthKey = compensationMonthKeyUtc(now);

  let thisMonth = 0;
  let priorMonths = 0;
  let baseAllTime = 0;
  let bonusAllTime = 0;
  let auditedCount = 0;
  let difficultyTotal = 0;
  let difficultyCount = 0;
  let qualityTotal = 0;
  let qualityCount = 0;
  const byProject = new Map<
    string,
    { auditedCount: number; baseCompensation: number; bonusCompensation: number; totalCompensation: number }
  >();
  const monthly = new Map<
    string,
    {
      baseCompensation: number;
      bonusCompensation: number;
      totalCompensation: number;
      auditedCount: number;
      totalMinutes: number;
      cases: AnnotatorCompensationCaseRow[];
    }
  >();
  const round2 = (n: number) => Math.round(n * 100) / 100;

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

    const baseAmount = computeTimeCompensation(
      c.compensationType,
      c.compensationAmount,
      c.annotationMinutes,
      c.maxMinutesPerCase,
      c.minMinutesPerCase,
    );
    const bonusAmount = c.annotatorBonus;
    const amount = Math.max(0, Math.round((baseAmount + bonusAmount) * 100) / 100);
    const minutes = c.annotationMinutes ?? 0;
    baseAllTime += baseAmount;
    bonusAllTime += bonusAmount;
    auditedCount += 1;
    const acceptedAt = c.reviews[0]?.createdAt ?? c.auditedAt ?? c.updatedAt;
    const monthKey = compensationMonthKeyUtc(acceptedAt);
    if (monthKey === thisMonthKey) {
      thisMonth += amount;
    } else {
      priorMonths += amount;
    }

    const monthPrev = monthly.get(monthKey) ?? {
      baseCompensation: 0,
      bonusCompensation: 0,
      totalCompensation: 0,
      auditedCount: 0,
      totalMinutes: 0,
      cases: [],
    };
    monthPrev.baseCompensation += baseAmount;
    monthPrev.bonusCompensation += bonusAmount;
    monthPrev.totalCompensation += amount;
    monthPrev.auditedCount += 1;
    monthPrev.totalMinutes += minutes;
    monthPrev.cases.push({
      caseDbId: c.id,
      caseId: c.caseId,
      project: c.redbrickProject.trim() || "—",
      submittedAt: c.completedAt?.toISOString() ?? null,
      compensationType: c.compensationType,
      compensationAmount: c.compensationAmount,
      annotationMinutes: c.annotationMinutes,
      minMinutesPerCase: c.minMinutesPerCase,
      maxMinutesPerCase: c.maxMinutesPerCase,
      wasResubmitted: resubmitPenaltyApplies(c._count.reviews > 0, acceptedAt),
      baseCompensation: round2(baseAmount),
      bonusCompensation: round2(bonusAmount),
      totalCompensation: round2(amount),
    });
    monthly.set(monthKey, monthPrev);

    const key = c.redbrickProject.trim() || "—";
    const prev = byProject.get(key) ?? {
      auditedCount: 0,
      baseCompensation: 0,
      bonusCompensation: 0,
      totalCompensation: 0,
    };
    prev.auditedCount += 1;
    prev.baseCompensation += baseAmount;
    prev.bonusCompensation += bonusAmount;
    prev.totalCompensation += amount;
    byProject.set(key, prev);
  }

  const history = [...monthly.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, value]) => {
      const totalMinutes = round2(value.totalMinutes);
      const totalCompensation = round2(value.totalCompensation);
      return {
        monthKey,
        baseCompensation: round2(value.baseCompensation),
        bonusCompensation: round2(value.bonusCompensation),
        totalCompensation,
        auditedCount: value.auditedCount,
        totalMinutes,
        averagePayPerHour:
          totalMinutes > 0 ? round2((totalCompensation * 60) / totalMinutes) : null,
        cases: [...value.cases].sort((a, b) => a.caseId.localeCompare(b.caseId)),
      };
    });
  const projects = Array.from(byProject.entries())
    .map(([name, v]) => ({
      name,
      auditedCount: v.auditedCount,
      baseCompensation: round2(v.baseCompensation),
      bonusCompensation: round2(v.bonusCompensation),
      totalCompensation: round2(v.totalCompensation),
    }))
    .sort((a, b) => b.totalCompensation - a.totalCompensation);

  return {
    thisMonth: round2(thisMonth),
    priorMonths: round2(priorMonths),
    allTime: round2(thisMonth + priorMonths),
    baseAllTime: round2(baseAllTime),
    bonusAllTime: round2(bonusAllTime),
    auditedCount,
    averageDifficulty: difficultyCount > 0 ? round2(difficultyTotal / difficultyCount) : null,
    difficultyCount,
    averageQuality: qualityCount > 0 ? round2(qualityTotal / qualityCount) : null,
    qualityCount,
    projects,
    history,
  };
}

export async function getAnnotatorAvailabilitySummary(): Promise<AnnotatorAvailabilitySummary> {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const days = getNextSevenDays();
  const [availabilityRows, assignedCases] = await Promise.all([
    prisma.annotatorAvailability.findMany({
      where: { userId: workspaceUserId, day: { in: days } },
      select: { day: true, availableHours: true },
    }),
    prisma.annotationCase.findMany({
      where: {
        annotatorId: workspaceUserId,
        isReference: false,
        status: { in: [CaseStatus.ASSIGNED, CaseStatus.SUBMITTED, CaseStatus.REJECTED] },
      },
      select: { minMinutesPerCase: true, maxMinutesPerCase: true },
    }),
  ]);
  return buildAvailabilitySummary(days, availabilityRows, assignedCases);
}

export async function getAnnotatorCapacityRows(): Promise<AnnotatorCapacityRow[]> {
  await requireRole("REVIEWER");
  const days = getNextSevenDays();
  const [annotators, availabilityRows, assignedCases] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ANNOTATOR" },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    prisma.annotatorAvailability.findMany({
      where: { day: { in: days } },
      select: { userId: true, day: true, availableHours: true },
    }),
    prisma.annotationCase.findMany({
      where: {
        annotatorId: { not: null },
        isReference: false,
        status: { in: [CaseStatus.ASSIGNED, CaseStatus.SUBMITTED, CaseStatus.REJECTED] },
      },
      select: { annotatorId: true, minMinutesPerCase: true, maxMinutesPerCase: true },
    }),
  ]);

  const availabilityByUser = new Map<string, { day: string; availableHours: number }[]>();
  for (const row of availabilityRows) {
    if (!availabilityByUser.has(row.userId)) availabilityByUser.set(row.userId, []);
    availabilityByUser.get(row.userId)!.push({ day: row.day, availableHours: row.availableHours });
  }

  const assignedByUser = new Map<string, { minMinutesPerCase: number; maxMinutesPerCase: number }[]>();
  for (const row of assignedCases) {
    if (!row.annotatorId) continue;
    if (!assignedByUser.has(row.annotatorId)) assignedByUser.set(row.annotatorId, []);
    assignedByUser.get(row.annotatorId)!.push({
      minMinutesPerCase: row.minMinutesPerCase,
      maxMinutesPerCase: row.maxMinutesPerCase,
    });
  }

  return annotators.map((annotator) => {
    const availability = buildAvailabilitySummary(
      days,
      availabilityByUser.get(annotator.id) ?? [],
      assignedByUser.get(annotator.id) ?? [],
    );
    const windows = buildCapacityWindows(
      days,
      availabilityByUser.get(annotator.id) ?? [],
      assignedByUser.get(annotator.id) ?? [],
    );
    return {
      id: annotator.id,
      name: annotator.name,
      email: annotator.email,
      windows,
      days: availability.days,
    };
  });
}

export async function saveAnnotatorAvailabilityAction(formData: FormData) {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const days = getNextSevenDays();
  const entries = days.map((day) => {
    const raw = String(formData.get(`availability_${day}`) ?? "").trim();
    const hours = raw === "" ? 0 : Number(raw);
    return {
      day,
      availableHours: Number.isFinite(hours) && hours >= 0 ? round1(hours) : 0,
    };
  });
  await prisma.$transaction(
    entries.map((entry) =>
      prisma.annotatorAvailability.upsert({
        where: { userId_day: { userId: workspaceUserId, day: entry.day } },
        create: {
          userId: workspaceUserId,
          day: entry.day,
          availableHours: entry.availableHours,
        },
        update: {
          availableHours: entry.availableHours,
        },
      }),
    ),
  );
  revalidatePath("/annotator");
  revalidatePath("/reviewer");
  return { ok: true as const };
}

const caseTopicIncludeLite = {
  caseTopics: {
    include: {
      topic: {
        select: {
          id: true,
          name: true,
          projects: {
            orderBy: { redbrickProject: "asc" as const },
            select: { id: true, redbrickProject: true },
          },
          scopes: {
            orderBy: { scopeOfWork: "asc" as const },
            select: { id: true, scopeOfWork: true },
          },
        },
      },
    },
  },
} as const;

const annotatorCaseListBase = {
  guide: { select: { id: true, title: true } },
  ...caseTopicIncludeLite,
} as const;

const annotatorCaseCountInclude = {
  _count: {
    select: {
      caseNotes: true,
      reviews: { where: { decision: "REJECT" as const } },
    },
  },
} as const;

const annotatorReviewInclude = {
  reviews: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { id: true, decision: true, comment: true, createdAt: true },
  },
  auditedBy: { select: { id: true, name: true, email: true } },
} as const;

export async function listCasesForAnnotator(userId: string) {
  const [available, mine, rejected, reference] = await Promise.all([
    prisma.annotationCase.findMany({
      where: { status: CaseStatus.AVAILABLE, isReference: false },
      orderBy: { createdAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorCaseCountInclude,
      },
    }),
    prisma.annotationCase.findMany({
      where: {
        annotatorId: userId,
        isReference: false,
        status: {
          in: [CaseStatus.ASSIGNED, CaseStatus.SUBMITTED, CaseStatus.ACCEPTED, CaseStatus.AUDITED],
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorReviewInclude,
        ...annotatorCaseCountInclude,
      },
    }),
    prisma.annotationCase.findMany({
      where: { annotatorId: userId, status: CaseStatus.REJECTED, isReference: false },
      orderBy: { updatedAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorReviewInclude,
        ...annotatorCaseCountInclude,
      },
    }),
    prisma.annotationCase.findMany({
      where: { isReference: true },
      orderBy: { updatedAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorReviewInclude,
        ...annotatorCaseCountInclude,
      },
    }),
  ]);
  const all = [...available, ...mine, ...rejected, ...reference];
  const scopes = [...new Set(all.map((c) => c.scopeOfWork.trim()).filter(Boolean))];
  const templates = await prisma.scopeOfWorkTemplate.findMany({
    where: scopes.length ? { scopeOfWork: { in: scopes } } : undefined,
    select: { scopeOfWork: true, template: true },
  });
  const templateByScope = new Map(templates.map((t) => [t.scopeOfWork.trim(), t.template] as const));
  function withTemplate<T extends { scopeOfWork: string; caseTopics: Parameters<typeof mapPrismaCaseTopics>[0] }>(
    rows: T[],
  ) {
    return rows.map((r) => {
      const { caseTopics, ...rest } = r;
      return {
        ...rest,
        topics: mapPrismaCaseTopics(caseTopics),
        scopeOfWorkTemplate: templateByScope.get(r.scopeOfWork.trim()) ?? null,
      };
    });
  }
  return {
    available: withTemplate(available),
    mine: withTemplate(mine),
    rejected: withTemplate(rejected),
    reference: withTemplate(reference),
  };
}
