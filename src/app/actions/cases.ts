"use server";
import { actionContext, errorCode, writeActionLog } from "@/lib/action-log";
import type { CreateCaseError } from "@/lib/create-case-errors";
import { resolveBatchCutoffs, resolveBatchPayChanges } from "@/lib/batch-case-edit";
import { getProjectQualityBonuses, getProjectFiveStarBonusPercent } from "@/lib/project-quality-settings";
import { isValidFiveStarBonusPercent, resolveCaseFiveStarBonusPercent } from "@/lib/project-quality-bonus";
import { withActionLog } from "@/lib/logged-action";


import { CaseStatus, CompensationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  compensationMonthKeyUtc,
  computeCaseBasePay,
  computeCompensation,
  computeTimeCompensation,
  caseRushPercent,
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
import { resolveBlankCompensation } from "@/lib/compensation-defaults";
import {
  findingsMapFromJson,
  resolvePerCaseRadiologistFindings,
} from "@/lib/radiologist-findings";
import {
  expandFieldCommentConfigs,
  fieldIsMandatory,
  fieldRequiresImage,
  parseFieldCommentConfigs,
  serializeFieldCommentConfigs,
  splitTemplateRows,
} from "@/lib/comment-choices";

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
const EXPIRABLE_CASE_STATUSES = [
  CaseStatus.AVAILABLE,
  CaseStatus.ASSIGNED,
  CaseStatus.REJECTED,
] as const;

/** Persist hard-cutoff transitions. Actions still include their own cutoff predicate for race safety. */
async function expireActiveCases(now = new Date()): Promise<void> {
  await prisma.annotationCase.updateMany({
    where: {
      isReference: false,
      status: { in: [...EXPIRABLE_CASE_STATUSES] },
      expiresAt: { lte: now },
    },
    data: { status: CaseStatus.EXPIRED },
  });
}

function isBeforeExpiry(now: Date) {
  return {
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

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
  | { ok: false; error: CreateCaseError; referenceId?: string };

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
  requireImagePerEntry: boolean;
  commentChoiceMode: string;
  commentChoices: string;
  /** JSON array of per-row { mode, choices } aligned with template lines. */
  commentFieldConfigs: string;
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
  const [caseRows, templateRows, topicScopeRows] = await Promise.all([
    prisma.annotationCase.findMany({
      select: { scopeOfWork: true, redbrickProject: true, project: true },
    }),
    prisma.scopeOfWorkTemplate.findMany({
      select: { scopeOfWork: true },
    }),
    prisma.topicScope.findMany({
      select: { scopeOfWork: true },
    }),
  ]);
  const scopeOptions = Array.from(
    new Set(
      [
        ...caseRows.map((c) => c.scopeOfWork.trim()),
        ...templateRows.map((t) => t.scopeOfWork.trim()),
        ...topicScopeRows.map((s) => s.scopeOfWork.trim()),
      ].filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const projectOptions = Array.from(
    new Set(caseRows.map((c) => c.project.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const rbProjectOptions = Array.from(
    new Set(caseRows.map((c) => c.redbrickProject.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  return { scopeOptions, projectOptions, rbProjectOptions };
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
  return withActionLog("createGuideAction", formData, async () => {
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
  });
}

export async function updateGuideAction(formData: FormData) {
  return withActionLog("updateGuideAction", formData, async () => {
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
  });
}

export async function deleteGuideAction(formData: FormData) {
  return withActionLog("deleteGuideAction", formData, async () => {
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
  });
}

export async function createTopicAction(formData: FormData) {
  return withActionLog("createTopicAction", formData, async () => {
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
  });
}

export async function updateTopicAction(formData: FormData) {
  return withActionLog("updateTopicAction", formData, async () => {
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
  });
}

export async function listScopeOfWorkTemplatesAction(): Promise<ScopeOfWorkTemplateRow[]> {
  await requireRole("REVIEWER");
  return prisma.scopeOfWorkTemplate.findMany({
    orderBy: { scopeOfWork: "asc" },
    select: {
      id: true,
      scopeOfWork: true,
      template: true,
      requireImagePerEntry: true,
      commentChoiceMode: true,
      commentChoices: true,
      commentFieldConfigs: true,
    },
  });
}

export async function upsertScopeOfWorkTemplateAction(formData: FormData): Promise<
  | { ok: true }
  | { ok: false; error: "required" | "scope_words" }
> {
  return withActionLog("upsertScopeOfWorkTemplateAction", formData, async () => {
    await requireRole("REVIEWER");
    const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
    const template = String(formData.get("template") ?? "").trim();
    const requireImagePerEntry = formData.get("requireImagePerEntry") === "on";
    const templateRows = splitTemplateRows(template);
    if (!scopeOfWork || templateRows.length === 0) {
      return { ok: false as const, error: "required" as const };
    }
    if (countWords(scopeOfWork) > MAX_SCOPE_WORDS) {
      return { ok: false as const, error: "scope_words" as const };
    }

    const rawFieldConfigs = String(formData.get("commentFieldConfigs") ?? "").trim();
    let fieldConfigs = parseFieldCommentConfigs(rawFieldConfigs);
    // Prefer structured per-field payload; fall back to legacy template-wide fields.
    if (fieldConfigs.length === 0 && !rawFieldConfigs) {
      const commentChoiceModeRaw = String(formData.get("commentChoiceMode") ?? "FREE")
        .trim()
        .toUpperCase();
      const legacyMode =
        commentChoiceModeRaw === "DROPDOWN" || commentChoiceModeRaw === "MULTI"
          ? commentChoiceModeRaw
          : "FREE";
      const legacyChoices = String(formData.get("commentChoices") ?? "")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      if (
        (legacyMode === "DROPDOWN" || legacyMode === "MULTI") &&
        legacyChoices.length === 0
      ) {
        return { ok: false as const, error: "required" as const };
      }
      fieldConfigs = templateRows.map(() => ({
        mode: legacyMode,
        choices: legacyMode === "FREE" ? [] : legacyChoices,
        mandatory: true,
        requireImage: requireImagePerEntry,
      }));
    } else {
      fieldConfigs = templateRows.map((_, index) => {
        const cfg = fieldConfigs[index];
        if (!cfg) {
          return {
            mode: "FREE" as const,
            choices: [] as string[],
            mandatory: true,
            requireImage: false,
          };
        }
        return {
          mode: cfg.mode,
          choices: cfg.mode === "FREE" ? [] : cfg.choices,
          mandatory: cfg.mandatory !== false,
          requireImage: cfg.requireImage === true,
        };
      });
    }

    for (const cfg of fieldConfigs) {
      if ((cfg.mode === "DROPDOWN" || cfg.mode === "MULTI") && cfg.choices.length === 0) {
        return { ok: false as const, error: "required" as const };
      }
    }

    const commentFieldConfigs = serializeFieldCommentConfigs(fieldConfigs);
    // Keep template-wide flag in sync for older clients / badges.
    const anyRequireImage = fieldConfigs.some((cfg) => cfg.requireImage);
    // Clear legacy globals once per-field configs are the source of truth.
    const commentChoiceMode = "FREE";
    const commentChoices = "";

    await prisma.scopeOfWorkTemplate.upsert({
      where: { scopeOfWork },
      create: {
        scopeOfWork,
        template: templateRows.join("\n"),
        requireImagePerEntry: anyRequireImage,
        commentChoiceMode,
        commentChoices,
        commentFieldConfigs,
      },
      update: {
        template: templateRows.join("\n"),
        requireImagePerEntry: anyRequireImage,
        commentChoiceMode,
        commentChoices,
        commentFieldConfigs,
      },
    });

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const };
  });
}

export async function deleteScopeOfWorkTemplateAction(formData: FormData): Promise<
  | { ok: true }
  | { ok: false; error: "required" | "notfound" }
> {
  return withActionLog("deleteScopeOfWorkTemplateAction", formData, async () => {
    await requireRole("REVIEWER");
    const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
    if (!scopeOfWork) return { ok: false as const, error: "required" as const };
    const row = await prisma.scopeOfWorkTemplate.findUnique({ where: { scopeOfWork }, select: { id: true } });
    if (!row) return { ok: false as const, error: "notfound" as const };

    await prisma.scopeOfWorkTemplate.delete({ where: { scopeOfWork } });
    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const };
  });
}

export async function createCaseAction(formData: FormData): Promise<CreateCaseActionResult> {
  return withActionLog("createCaseAction", formData, async (): Promise<CreateCaseActionResult> => {
    try {
      const actorId = actionContext.getStore()?.actorId;
      const user = actorId ? await prisma.user.findUnique({ where: { id: actorId } }) : null;
      if (!user) return { ok: false, error: "auth" };
      if (user.role !== "REVIEWER") return { ok: false, error: "forbidden" };
      const rawIds = String(formData.get("caseIds") ?? "").trim();
      const { unique, duplicateTokens } = parseCaseIdBatch(rawIds);
      const duplicateInList = [...new Set(duplicateTokens)];

      const redbrickProject = String(formData.get("redbrickProject") ?? "").trim();
      const project = String(formData.get("project") ?? "").trim();
      const guideId = String(formData.get("guideId") ?? "").trim();
      const topicIds = parseTopicIdsFromFormData(formData);
      const guideline = String(formData.get("guideline") ?? "").trim();
      const defaultRadiologistFinding = String(formData.get("radiologistFinding") ?? "").trim();
      const findingsByCaseIdRaw = findingsMapFromJson(
        String(formData.get("radiologistFindingsByCaseId") ?? ""),
      );
      const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim();
      const bonusRaw = String(formData.get("fiveStarBonusPercent") ?? "").trim();
      const fiveStarBonusPercent = Number(bonusRaw);
      if (!bonusRaw || !isValidFiveStarBonusPercent(fiveStarBonusPercent)) {
        return { ok: false, error: "quality_bonus" };
      }
      const minMinutesPerCase = Number(formData.get("minMinutesPerCase"));
      const maxMinutesPerCase = Number(formData.get("maxMinutesPerCase"));
      const compensationAmountRaw = String(formData.get("compensationAmount") ?? "").trim();
      let compensationType =
        String(formData.get("compensationType") ?? "") === "PER_MINUTE"
          ? CompensationType.PER_MINUTE
          : CompensationType.PER_CASE;
      let compensationAmount: number | null = null;
      const videoGuideUrls = parseVideoGuideUrlsInput(String(formData.get("videoGuideUrls") ?? ""));
      const deadlineHours = Number(formData.get("deadlineHours"));
      if (!Number.isFinite(deadlineHours) || deadlineHours <= 0) {
        return { ok: false as const, error: "deadline" as const };
      }
      const expiryHours = Number(formData.get("expiryHours"));
      if (!Number.isFinite(expiryHours) || expiryHours <= deadlineHours) {
        return { ok: false as const, error: "expiry" as const };
      }
      const issuedAt = Date.now();
      const deadline = new Date(issuedAt + deadlineHours * 60 * 60 * 1000);
      const expiresAt = new Date(issuedAt + expiryHours * 60 * 60 * 1000);

      const normalizedGuideline = guideline;
      if (guideId) {
        const guide = await prisma.guide.findUnique({
          where: { id: guideId },
          select: { id: true },
        });
        if (!guide) {
          return { ok: false as const, error: "guide" };
        }
      }

      const topicsAllowed = await assertTopicsAllowedForCase(topicIds, redbrickProject, scopeOfWork);
      if (!topicsAllowed) {
        return { ok: false as const, error: "topics" };
      }

      const hasInstructionSource = await hasCaseInstructionSource(
        scopeOfWork,
        guideId,
        topicIds,
        normalizedGuideline,
      );

      if (!project) return { ok: false, error: "project" };
      if (!redbrickProject) return { ok: false, error: "redbrick_project" };
      if (!scopeOfWork) return { ok: false, error: "scope" };
      if (!hasInstructionSource) return { ok: false, error: "instructions" };
      if (!Number.isInteger(minMinutesPerCase) || minMinutesPerCase <= 0 ||
          !Number.isInteger(maxMinutesPerCase) || maxMinutesPerCase <= 0) {
        return { ok: false, error: "limits" };
      }

      if (compensationAmountRaw === "") {
        const resolved = await resolveBlankCompensation(redbrickProject, scopeOfWork);
        if (!resolved) {
          return { ok: false as const, error: "comp_amount" };
        }
        compensationType = resolved.compensationType;
        compensationAmount = resolved.compensationAmount;
      } else {
        compensationAmount = Number(compensationAmountRaw);
        if (!Number.isFinite(compensationAmount) || compensationAmount < 0) {
          return { ok: false as const, error: "invalid_amount" };
        }
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

      const findingsByCaseId = resolvePerCaseRadiologistFindings({
        caseIds: unique,
        findingsByCaseId: findingsByCaseIdRaw,
        sharedFinding: defaultRadiologistFinding,
      });

      const assignEmail = String(formData.get("assignEmail") ?? "")
        .trim()
        .toLowerCase();
      let annotatorId: string | undefined;
      let status: CaseStatus = CaseStatus.AVAILABLE;
      let assignedAt: Date | undefined;
      if (assignEmail) {
        const u = await prisma.user.findUnique({ where: { email: assignEmail } });
        if (u?.role !== "ANNOTATOR") return { ok: false, error: "annotator" };
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
          redbrickProject,
        },
        select: { caseId: true },
      });
      const existingSet = new Set(existingRows.map((r) => r.caseId));
      const skippedExisting = unique.filter((id) => existingSet.has(id));
      const toCreate = unique.filter((id) => !existingSet.has(id));

      const base = {
        project,
        redbrickProject,
        guideId: guideId || null,
        guideline: normalizedGuideline,
        scopeOfWork,
        minMinutesPerCase: Math.floor(minMinutesPerCase),
        maxMinutesPerCase: Math.floor(maxMinutesPerCase),
        compensationType,
        compensationAmount,
        fiveStarBonusPercent,
        annotatorBonus: 0,
        videoGuideUrls: videoGuideUrlsToDbColumn(videoGuideUrls),
        deadline,
        expiresAt,
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
          data: toCreate.map((caseId) => ({
            ...base,
            caseId,
            radiologistFinding: findingsByCaseId.get(caseId)?.trim() || "",
          })),
        });
        created = res.count;
        await writeActionLog({ action: "createCaseAction", outcome: "cases_saved", created });

        const createdRows = await prisma.annotationCase.findMany({
          where: { caseId: { in: toCreate }, scopeOfWork, redbrickProject },
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
          redbrickProject,
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
    } catch (error) {
      const reason = errorCode(error);
      await writeActionLog({ action: "createCaseAction", outcome: "failed", reason });
      return { ok: false, error: reason === "P2002" ? "conflict" : "server", referenceId: actionContext.getStore()?.referenceId };
    }
  });
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
      status: { in: [CaseStatus.ASSIGNED, CaseStatus.PAUSED] },
    },
  });
  return count > 0;
}

export async function assignCaseAction(caseDbId: string) {
  return withActionLog("assignCaseAction", { caseDbId }, async () => {
    const { workspaceUserId } = await requireAnnotatorWorkspace();
    const now = new Date();
    await expireActiveCases(now);
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
        ...isBeforeExpiry(now),
      },
      data: {
        annotatorId: workspaceUserId,
        status: CaseStatus.ASSIGNED,
        assignedAt: now,
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
  });
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
  return withActionLog("acknowledgeAnnotatorReviewAction", { caseDbId }, async () => {
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
  });
}

export async function unassignCaseAction(caseDbId: string) {
  return withActionLog("unassignCaseAction", { caseDbId }, async () => {
    const { user, workspaceUserId } = await requireAnnotatorWorkspace();
    const row = await prisma.annotationCase.findUnique({
      where: { id: caseDbId },
      select: { id: true, annotatorId: true, status: true, isReference: true, expiresAt: true },
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
        status:
          row.expiresAt && row.expiresAt <= new Date()
            ? CaseStatus.EXPIRED
            : CaseStatus.AVAILABLE,
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
  });
}

/** Reviewer assigns an unclaimed case to a specific annotator (exclusive). */
export async function reviewerAssignCaseAction(caseDbId: string, annotatorUserId: string) {
  return withActionLog("reviewerAssignCaseAction", { caseDbId, annotatorUserId }, async () => {
    await requireRole("REVIEWER");
    const now = new Date();
    await expireActiveCases(now);
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
        ...isBeforeExpiry(now),
      },
      data: {
        annotatorId: target.id,
        status: CaseStatus.ASSIGNED,
        assignedAt: now,
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
  });
}

/**
 * Reviewer closes a case administratively so it leaves the grab pool.
 * Does not create a Review or payout — use reviewCaseAction for submitted audits.
 */
export async function adminCompleteCaseAction(caseDbId: string) {
  return withActionLog("adminCompleteCaseAction", { caseDbId }, async () => {
    const reviewer = await requireRole("REVIEWER");
    const row = await prisma.annotationCase.findUnique({
      where: { id: caseDbId },
      select: { id: true, status: true, isReference: true },
    });
    if (!row || row.isReference) {
      return { ok: false as const, error: "state" as const };
    }
    if (
      row.status !== CaseStatus.AVAILABLE &&
      row.status !== CaseStatus.ASSIGNED &&
      row.status !== CaseStatus.REJECTED
    ) {
      return { ok: false as const, error: "state" as const };
    }

    const updated = await prisma.annotationCase.updateMany({
      where: {
        id: caseDbId,
        status: { in: [CaseStatus.AVAILABLE, CaseStatus.ASSIGNED, CaseStatus.REJECTED] },
        isReference: false,
      },
      data: {
        status: CaseStatus.ADMIN_COMPLETED,
        auditedAt: new Date(),
        auditedById: reviewer.id,
        qualityRating: null,
        annotatorBonus: 0,
      },
    });
    if (updated.count !== 1) {
      return { ok: false as const, error: "state" as const };
    }

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const };
  });
}

/** Reviewer removes a case from the pool when no annotator has claimed it yet. */
export async function deleteCaseAction(caseDbId: string) {
  return withActionLog("deleteCaseAction", { caseDbId }, async () => {
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
  });
}

/** Reviewer (admin) updates per-case compensation rate. */
export async function updateCaseCompensationAction(input: {
  caseDbId: string;
  compensationType: CompensationType;
  compensationAmount: number;
  annotatorBonus: number;
}) {
  return withActionLog("updateCaseCompensationAction", input, async () => {
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
  });
}

export async function updateCaseDetailsAction(input: {
  caseDbId: string;
  caseId: string;
  status: CaseStatus;
  project: string;
  redbrickProject: string;
  guideId?: string | null;
  topicIds: string[];
  guideline: string;
  radiologistFinding: string;
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
  annotatorBonus: number;
  isReference: boolean;
  videoGuideUrls: string[];
  /** ISO string or null to clear. */
  deadline: string | null;
  /** ISO string or null to clear (legacy cases may have no cutoff). */
  expiresAt: string | null;
}) {
  return withActionLog("updateCaseDetailsAction", input, async () => {
    await requireRole("REVIEWER");
    const caseId = input.caseId.trim();
    const project = input.project.trim();
    const redbrickProject = input.redbrickProject.trim();
    const guideId = input.guideId?.trim() || "";
    const topicIds = [...new Set(input.topicIds.map((id) => id.trim()).filter(Boolean))];
    const guideline = input.guideline.trim();
    const radiologistFinding = input.radiologistFinding.trim();
    const scopeOfWork = input.scopeOfWork.trim();
    const minMinutesPerCase = Math.floor(input.minMinutesPerCase);
    const maxMinutesPerCase = Math.floor(input.maxMinutesPerCase);

    const hasInstructionSource = await hasCaseInstructionSource(
      scopeOfWork,
      guideId,
      topicIds,
      guideline,
    );

    let deadline: Date | null = null;
    if (input.deadline != null && input.deadline !== "") {
      const parsed = new Date(input.deadline);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false as const, error: "deadline" as const };
      }
      deadline = parsed;
    }
    let expiresAt: Date | null = null;
    if (input.expiresAt != null && input.expiresAt !== "") {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false as const, error: "expiry" as const };
      }
      expiresAt = parsed;
    }
    if (deadline && expiresAt && expiresAt <= deadline) {
      return { ok: false as const, error: "expiry" as const };
    }

    if (!caseId) {
      return { ok: false as const, error: "case_id" as const };
    }
    if (!project) {
      return { ok: false as const, error: "project" as const };
    }
    if (!redbrickProject) {
      return { ok: false as const, error: "redbrick_project" as const };
    }
    if (!scopeOfWork) {
      return { ok: false as const, error: "scope" as const };
    }
    if (!hasInstructionSource) {
      return { ok: false as const, error: "instructions" as const };
    }
    if (
      !Number.isFinite(minMinutesPerCase) ||
      minMinutesPerCase <= 0 ||
      !Number.isFinite(maxMinutesPerCase) ||
      maxMinutesPerCase <= 0
    ) {
      return { ok: false as const, error: "limits" as const };
    }
    if (!Number.isFinite(input.compensationAmount) || input.compensationAmount < 0) {
      return { ok: false as const, error: "invalid_amount" as const };
    }
    // Quality adjustments are signed (penalties for 1–3★ can be negative).
    if (!Number.isFinite(input.annotatorBonus)) {
      return { ok: false as const, error: "bonus" as const };
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
      input.status !== CaseStatus.REJECTED &&
      input.status !== CaseStatus.EXPIRED &&
      input.status !== CaseStatus.ADMIN_COMPLETED &&
      input.status !== CaseStatus.PAUSED
    ) {
      return { ok: false as const, error: "status" as const };
    }

    if (
      input.compensationType !== CompensationType.PER_CASE &&
      input.compensationType !== CompensationType.PER_MINUTE
    ) {
      return { ok: false as const, error: "comp_type" as const };
    }

    if (guideId) {
      const guide = await prisma.guide.findUnique({
        where: { id: guideId },
        select: { id: true },
      });
      if (!guide) {
        return { ok: false as const, error: "guide" as const };
      }
    }

    if (!(await assertTopicsAllowedForCase(topicIds, redbrickProject, scopeOfWork))) {
      return { ok: false as const, error: "topics" as const };
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
        redbrickProject,
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
          project,
          redbrickProject,
          guideId: guideId || null,
          guideline,
          radiologistFinding,
          scopeOfWork,
          minMinutesPerCase,
          maxMinutesPerCase,
          compensationType: input.compensationType,
          compensationAmount: input.compensationAmount,
          annotatorBonus: input.annotatorBonus,
          isReference: input.isReference,
          deadline,
          expiresAt,
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
  });
}

export async function updateCaseReferenceAction(input: {
  caseDbId: string;
  isReference: boolean;
}) {
  return withActionLog("updateCaseReferenceAction", input, async () => {
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
  });
}

/** Change case status only — skips full field re-validation (for reopen / re-audit). */
export async function updateCaseStatusAction(input: {
  caseDbId: string;
  status: CaseStatus;
  isReference?: boolean;
}) {
  return withActionLog("updateCaseStatusAction", input, async () => {
    await requireRole("REVIEWER");
    const caseDbId = input.caseDbId.trim();
    if (!caseDbId) return { ok: false as const, error: "case_id" as const };

    if (
      input.status !== CaseStatus.AVAILABLE &&
      input.status !== CaseStatus.ASSIGNED &&
      input.status !== CaseStatus.SUBMITTED &&
      input.status !== CaseStatus.ACCEPTED &&
      input.status !== CaseStatus.AUDITED &&
      input.status !== CaseStatus.REJECTED &&
      input.status !== CaseStatus.EXPIRED &&
      input.status !== CaseStatus.ADMIN_COMPLETED &&
      input.status !== CaseStatus.PAUSED
    ) {
      return { ok: false as const, error: "status" as const };
    }

    const row = await prisma.annotationCase.findUnique({
      where: { id: caseDbId },
      select: { id: true },
    });
    if (!row) return { ok: false as const, error: "notfound" as const };

    const data: {
      status: CaseStatus;
      isReference?: boolean;
      annotatorId?: null;
      assignedAt?: null;
      completedAt?: null;
      annotationMinutes?: null;
      difficultyRating?: null;
      auditedAt?: null;
      auditedById?: null;
      qualityRating?: null;
    } = { status: input.status };

    if (typeof input.isReference === "boolean") {
      data.isReference = input.isReference;
    }

    // Releasing back to the pool clears assignment fields (same as full edit).
    if (input.status === CaseStatus.AVAILABLE) {
      data.annotatorId = null;
      data.assignedAt = null;
      data.completedAt = null;
      data.annotationMinutes = null;
      data.difficultyRating = null;
      data.auditedAt = null;
      data.auditedById = null;
      data.qualityRating = null;
    }

    await prisma.annotationCase.update({
      where: { id: caseDbId },
      data,
    });

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const };
  });
}

export async function batchUpdateCasesAction(
  input: {
    caseDbIds: string[];
    project: string;
    redbrickProject: string;
    guideId?: string | null;
    topicIds: string[];
    guideline: string;
    /** Applied to all selected cases when set (may be empty string to clear). Overridden per case by findingsByCaseId. */
    radiologistFinding: string;
    /** Optional per-case findings keyed by caseId (study ID). */
    findingsByCaseId?: Record<string, string>;
    videoGuideUrls: string[];
    scopeOfWork: string;
    minMinutesPerCase: number;
    maxMinutesPerCase: number;
    compensationType: CompensationType;
    /** Null applies the configured project/scope default, matching case creation. */
    compensationAmount: number | null;
    /** Null preserves each case's signed, already-saved review adjustment. */
    annotatorBonus: number | null;
    /** Null preserves each case's five-star percentage. */
    fiveStarBonusPercent: number | null;
    /** ISO replacements, or both null to keep each case’s current cutoffs. */
    deadline: string | null;
    expiresAt: string | null;
    /** Keep current owners, release all selected cases, or assign all to one annotator. */
    assignment: "KEEP" | "UNASSIGN" | string;
  },
  continuityReportFormData?: FormData,
) {
  return withActionLog("batchUpdateCasesAction", input, async () => {
    try {
      await requireRole("REVIEWER");
      const caseDbIds = [...new Set(input.caseDbIds.map((id) => id.trim()).filter(Boolean))];
      const project = input.project.trim();
      const redbrickProject = input.redbrickProject.trim();
      const guideId = input.guideId?.trim() || "";
      const topicIds = [...new Set(input.topicIds.map((id) => id.trim()).filter(Boolean))];
      const guideline = input.guideline.trim();
      const radiologistFindingShared = input.radiologistFinding.trim();
      const findingsByCaseIdInput = input.findingsByCaseId ?? {};
      const scopeOfWork = input.scopeOfWork.trim();
      const minMinutesPerCase = input.minMinutesPerCase;
      const maxMinutesPerCase = input.maxMinutesPerCase;
      let compensationType = input.compensationType;
      let compensationAmount = input.compensationAmount;
      const cutoffs = resolveBatchCutoffs(input.deadline, input.expiresAt);
      if (!cutoffs.ok) return cutoffs;
      const payChanges = resolveBatchPayChanges(input.fiveStarBonusPercent, input.annotatorBonus);
      if (!payChanges.ok) return payChanges;

      if (caseDbIds.length === 0) {
        return { ok: false as const, error: "no_cases" as const };
      }

      const hasInstructionSource = await hasCaseInstructionSource(
        scopeOfWork,
        guideId,
        topicIds,
        guideline,
      );

      if (!project) return { ok: false as const, error: "project" as const };
      if (!redbrickProject) return { ok: false as const, error: "redbrick_project" as const };
      if (!scopeOfWork) return { ok: false as const, error: "scope" as const };
      if (!hasInstructionSource) return { ok: false as const, error: "instructions" as const };
      if (compensationAmount != null && (!Number.isFinite(compensationAmount) || compensationAmount < 0)) {
        return { ok: false as const, error: "invalid_amount" as const };
      }
      if (!Number.isInteger(minMinutesPerCase) || minMinutesPerCase <= 0 ||
          !Number.isInteger(maxMinutesPerCase) || maxMinutesPerCase < minMinutesPerCase) {
        return { ok: false as const, error: "limits" as const };
      }
      if (countWords(scopeOfWork) > MAX_SCOPE_WORDS) {
        return { ok: false as const, error: "scope_words" as const };
      }
      if (
        compensationType !== CompensationType.PER_CASE &&
        compensationType !== CompensationType.PER_MINUTE
      ) {
        return { ok: false as const, error: "required" as const };
      }

      if (compensationAmount == null) {
        const resolved = await resolveBlankCompensation(redbrickProject, scopeOfWork);
        if (!resolved) {
          return { ok: false as const, error: "comp_amount" as const };
        }
        compensationType = resolved.compensationType;
        compensationAmount = resolved.compensationAmount;
      }

      if (guideId) {
        const guide = await prisma.guide.findUnique({
          where: { id: guideId },
          select: { id: true },
        });
        if (!guide) {
          return { ok: false as const, error: "guide" as const };
        }
      }

      if (!(await assertTopicsAllowedForCase(topicIds, redbrickProject, scopeOfWork))) {
        return { ok: false as const, error: "topics" as const };
      }

      const rows = await prisma.annotationCase.findMany({
        where: { id: { in: caseDbIds } },
        select: { id: true, caseId: true, status: true, isReference: true },
      });
      if (rows.length !== caseDbIds.length) {
        return { ok: false as const, error: "no_cases" as const };
      }

      const findingsByCaseId = resolvePerCaseRadiologistFindings({
        caseIds: rows.map((row) => row.caseId),
        findingsByCaseId: findingsByCaseIdInput,
        sharedFinding: radiologistFindingShared,
      });
      const findingsInputProvided =
        radiologistFindingShared !== "" ||
        Object.values(findingsByCaseIdInput).some((v) => String(v ?? "").trim() !== "");

      const assignment = input.assignment.trim();
      let assignmentData:
        | Record<string, never>
        | {
            annotatorId: null;
            status: CaseStatus;
            assignedAt: null;
            completedAt: null;
            annotationMinutes: null;
            difficultyRating: null;
            auditedAt: null;
            auditedById: null;
            qualityRating: null;
            annotatorAcknowledgedReviewId: null;
          }
        | {
            annotatorId: string;
            status: CaseStatus;
            assignedAt: Date;
            completedAt: null;
            annotationMinutes: null;
            difficultyRating: null;
            auditedAt: null;
            auditedById: null;
            qualityRating: null;
            annotatorAcknowledgedReviewId: null;
          } = {};
      let assignedAnnotatorId: string | null = null;
      if (assignment !== "KEEP") {
        if (
          rows.some(
            (row) =>
              row.isReference ||
              (row.status !== CaseStatus.AVAILABLE && row.status !== CaseStatus.ASSIGNED),
          )
        ) {
          return { ok: false as const, error: "assignment_state" as const };
        }
        if (assignment === "UNASSIGN") {
          assignmentData = {
            annotatorId: null,
            status: CaseStatus.AVAILABLE,
            assignedAt: null,
            completedAt: null,
            annotationMinutes: null,
            difficultyRating: null,
            auditedAt: null,
            auditedById: null,
            qualityRating: null,
            annotatorAcknowledgedReviewId: null,
          };
        } else {
          const annotator = await prisma.user.findUnique({
            where: { id: assignment },
            select: { id: true, role: true },
          });
          if (!annotator || annotator.role !== "ANNOTATOR") {
            return { ok: false as const, error: "invalid_annotator" as const };
          }
          assignedAnnotatorId = annotator.id;
          assignmentData = {
            annotatorId: annotator.id,
            status: CaseStatus.ASSIGNED,
            assignedAt: new Date(),
            completedAt: null,
            annotationMinutes: null,
            difficultyRating: null,
            auditedAt: null,
            auditedById: null,
            qualityRating: null,
            annotatorAcknowledgedReviewId: null,
          };
        }
      }

      const videoGuideUrlsCol = videoGuideUrlsToDbColumn(
        parseVideoGuideUrlsInput(input.videoGuideUrls.join("\n")),
      );

      await prisma.$transaction(async (tx) => {
        await tx.annotationCase.updateMany({
          where: { id: { in: caseDbIds } },
          data: {
            project,
            redbrickProject,
            guideId: guideId || null,
            guideline,
            videoGuideUrls: videoGuideUrlsCol,
            scopeOfWork,
            minMinutesPerCase,
            maxMinutesPerCase,
            compensationType,
            compensationAmount,
            ...payChanges.data,
            ...cutoffs.data,
            ...assignmentData,
          },
        });

        if (findingsInputProvided) {
          for (const row of rows) {
            await tx.annotationCase.update({
              where: { id: row.id },
              data: { radiologistFinding: findingsByCaseId.get(row.caseId) ?? "" },
            });
          }
        }

        await tx.annotationCaseTopic.deleteMany({
          where: { annotationCaseId: { in: caseDbIds } },
        });
        if (topicIds.length > 0) {
          await tx.annotationCaseTopic.createMany({
            data: caseDbIds.flatMap((annotationCaseId) =>
              topicIds.map((topicId) => ({ annotationCaseId, topicId })),
            ),
          });
        }
      });

      if (assignedAnnotatorId) {
        for (const row of rows) {
          await pushNotification(
            [assignedAnnotatorId],
            NOTIF.CASE_ASSIGNED,
            row.id,
            row.caseId,
          );
        }
      }

      let continuityReportsAttached = 0;
      let continuityReportsUnmatched: string[] = [];
      if (continuityReportFormData) {
        const parsed = await readContinuityReportsFromFormData(
          continuityReportFormData,
          rows.map((row) => row.caseId),
        );
        continuityReportsUnmatched = parsed.unmatchedFilenames;
        for (const row of rows) {
          const content = parsed.byCaseId.get(row.caseId);
          if (!content) continue;
          await saveContinuityReport(row.id, content);
          await prisma.annotationCase.update({
            where: { id: row.id },
            data: { hasContinuityReport: true },
          });
          continuityReportsAttached += 1;
        }
      }

      revalidatePath("/reviewer");
      revalidatePath("/annotator");
      return {
        ok: true as const,
        updated: caseDbIds.length,
        continuityReportsAttached,
        continuityReportsUnmatched,
      };
    } catch (error) {
      const reason = errorCode(error);
      await writeActionLog({ action: "batchUpdateCasesAction", outcome: "failed", reason });
      return { ok: false as const, error: reason === "P2002" ? "conflict" as const : reason === "Unauthorized" ? "auth" as const : reason === "Forbidden" ? "forbidden" as const : "server" as const, referenceId: actionContext.getStore()?.referenceId };
    }
  });
}

/** Reviewer pauses or resumes multiple cases.
 * Pause: AVAILABLE / ASSIGNED / REJECTED → PAUSED (assignment kept).
 * Resume: PAUSED → ASSIGNED if annotator set, else AVAILABLE.
 */
export async function batchSetCasePauseAction(
  caseDbIds: string[],
  paused: boolean,
) {
  return withActionLog("batchSetCasePauseAction", { caseDbIds, paused }, async () => {
    await requireRole("REVIEWER");
    const ids = [...new Set(caseDbIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { ok: false as const, error: "no_cases" as const };
    }

    const rows = await prisma.annotationCase.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, annotatorId: true },
    });

    if (paused) {
      const pauseable = rows.filter(
        (row) =>
          row.status === CaseStatus.AVAILABLE || row.status === CaseStatus.ASSIGNED,
      );
      if (pauseable.length === 0) {
        return { ok: false as const, error: "none_pausable" as const };
      }
      const pauseableIds = pauseable.map((row) => row.id);
      await prisma.annotationCase.updateMany({
        where: {
          id: { in: pauseableIds },
          status: { in: [CaseStatus.AVAILABLE, CaseStatus.ASSIGNED] },
        },
        data: { status: CaseStatus.PAUSED },
      });
      revalidatePath("/reviewer");
      revalidatePath("/annotator");
      return {
        ok: true as const,
        updated: pauseableIds.length,
        skipped: ids.length - pauseableIds.length,
      };
    }

    const pausedRows = rows.filter((row) => row.status === CaseStatus.PAUSED);
    if (pausedRows.length === 0) {
      return { ok: false as const, error: "none_paused" as const };
    }

    const withAnnotator = pausedRows.filter((row) => row.annotatorId).map((row) => row.id);
    const withoutAnnotator = pausedRows.filter((row) => !row.annotatorId).map((row) => row.id);

    await prisma.$transaction(async (tx) => {
      if (withAnnotator.length > 0) {
        await tx.annotationCase.updateMany({
          where: { id: { in: withAnnotator }, status: CaseStatus.PAUSED },
          data: { status: CaseStatus.ASSIGNED },
        });
      }
      if (withoutAnnotator.length > 0) {
        await tx.annotationCase.updateMany({
          where: { id: { in: withoutAnnotator }, status: CaseStatus.PAUSED },
          data: { status: CaseStatus.AVAILABLE },
        });
      }
    });

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return {
      ok: true as const,
      updated: pausedRows.length,
      skipped: ids.length - pausedRows.length,
    };
  });
}

/** Reviewer removes multiple unclaimed available cases from the pool. */
export async function batchDeleteCasesAction(caseDbIds: string[]) {
  return withActionLog("batchDeleteCasesAction", { caseDbIds }, async () => {
    await requireRole("REVIEWER");
    const ids = [...new Set(caseDbIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { ok: false as const, error: "no_cases" as const };
    }

    const deletable = await prisma.annotationCase.findMany({
      where: {
        id: { in: ids },
        status: CaseStatus.AVAILABLE,
        annotatorId: null,
      },
      select: { id: true },
    });
    if (deletable.length === 0) {
      return { ok: false as const, error: "none_removable" as const };
    }

    const deletableIds = deletable.map((row) => row.id);
    await prisma.annotationCase.deleteMany({ where: { id: { in: deletableIds } } });
    await Promise.all(deletableIds.map((id) => deleteContinuityReport(id)));
    await prisma.notification.deleteMany({
      where: { annotationCaseId: { in: deletableIds } },
    });

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return {
      ok: true as const,
      deleted: deletableIds.length,
      skipped: ids.length - deletableIds.length,
    };
  });
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
  return withActionLog("submitAnnotationAction", { caseDbId, minutes, difficultyRating }, async () => {
    const { user, workspaceUserId } = await requireAnnotatorWorkspace();
    const now = new Date();
    await expireActiveCases(now);
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
    if (row.status === CaseStatus.PAUSED) {
      return { ok: false as const, error: "paused" as const };
    }
    if (row.status === CaseStatus.EXPIRED || (row.expiresAt && row.expiresAt <= now)) {
      return { ok: false as const, error: "expired" as const };
    }
    if (row.status !== CaseStatus.ASSIGNED && row.status !== CaseStatus.REJECTED) {
      return { ok: false as const, error: "state" };
    }
    const template = await prisma.scopeOfWorkTemplate.findUnique({
      where: { scopeOfWork: row.scopeOfWork.trim() },
      select: {
        template: true,
        requireImagePerEntry: true,
        commentChoiceMode: true,
        commentChoices: true,
        commentFieldConfigs: true,
      },
    });
    const templateRows = splitTemplateRows(template?.template);
    if (templateRows.length > 0) {
      const fieldConfigs = expandFieldCommentConfigs(
        template?.template,
        template?.commentFieldConfigs,
        template?.commentChoiceMode,
        template?.commentChoices,
        template?.requireImagePerEntry ?? false,
      );
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
      const rowsWithImages = new Set<number>();
      for (const note of notes) {
        const content = note.content?.trim() ?? "";
        const match = content.match(TEMPLATE_ROW_MARKER_RE);
        if (!match) continue;
        const index = Number(match[1]) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= templateRows.length) continue;
        const value = (match[2] ?? "").trim();
        if (!value) continue;
        coveredRows.add(index);
        if (getCaseNoteImages(note).length > 0) rowsWithImages.add(index);
      }
      const missingMandatory = templateRows.filter(
        (_, index) => fieldIsMandatory(fieldConfigs[index]) && !coveredRows.has(index),
      );
      if (missingMandatory.length > 0) {
        return {
          ok: false as const,
          error: "template" as const,
          missingTemplateFields: missingMandatory,
        };
      }
      const missingImages = templateRows.filter((_, index) => {
        if (!fieldRequiresImage(fieldConfigs[index])) return false;
        // Mandatory image fields must be filled with images; optional ones only if answered.
        const mustHaveAnswer = fieldIsMandatory(fieldConfigs[index]) || coveredRows.has(index);
        if (!mustHaveAnswer) return false;
        return !rowsWithImages.has(index);
      });
      if (missingImages.length > 0) {
        return {
          ok: false as const,
          error: "template_images" as const,
          missingTemplateFields: missingImages,
        };
      }
    }
    const isResubmit = row.status === CaseStatus.REJECTED;
    const totalMinutes = isResubmit
      ? (row.annotationMinutes ?? 0) + Math.floor(minutes)
      : Math.floor(minutes);
    const submitted = await prisma.annotationCase.updateMany({
      where: {
        id: caseDbId,
        annotatorId: workspaceUserId,
        status: row.status,
        ...isBeforeExpiry(now),
      },
      data: {
        status: CaseStatus.SUBMITTED,
        annotationMinutes: totalMinutes,
        difficultyRating,
        completedAt: now,
      },
    });
    if (submitted.count !== 1) {
      await expireActiveCases();
      const latest = await prisma.annotationCase.findUnique({
        where: { id: caseDbId },
        select: { status: true, expiresAt: true },
      });
      return {
        ok: false as const,
        error:
          latest?.status === CaseStatus.EXPIRED ||
          (latest?.expiresAt != null && latest.expiresAt <= new Date())
            ? ("expired" as const)
            : ("state" as const),
      };
    }
    const reviewerIds = await getReviewerNotificationRecipients();
    await pushNotification(reviewerIds, NOTIF.CASE_SUBMITTED, caseDbId, row.caseId);
    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return { ok: true as const };
  });
}

export async function reviewCaseAction(input: {
  caseDbId: string;
  decision: "ACCEPT" | "REJECT";
  comment: string;
  screenshotData: string | null;
  qualityRating: number;
  annotatorBonus?: number;
}) {
  return withActionLog("reviewCaseAction", input, async () => {
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
    const priorRejectBySameAnnotator =
      row.annotatorId == null
        ? null
        : await prisma.review.findFirst({
            where: {
              annotationCaseId: row.id,
              decision: "REJECT",
              annotatorId: row.annotatorId,
            },
            select: { id: true },
          });
    const rushPercent = caseRushPercent({
      ...row,
      wasRejected: priorRejectBySameAnnotator != null,
    });
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
          rushPercent,
        );
        approvedBonus = suggestedQualityAdjustment(input.qualityRating, caseBase, {
          fiveStarBonusPercent: row.fiveStarBonusPercent ?? await getProjectFiveStarBonusPercent(row.project),
          wasResubmitted: priorRejectBySameAnnotator != null,
          at: new Date(),
        });
      }
    }

    await prisma.$transaction([
      prisma.review.create({
        data: {
          annotationCaseId: row.id,
          reviewerId: reviewer.id,
          annotatorId: row.annotatorId,
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
            rushPercent,
          )
        : 0,
    };
  });
}

/** Update annotation quality on an already audited (or legacy accepted) case. */
export async function rerateCaseQualityAction(input: {
  caseDbId: string;
  qualityRating: number;
  annotatorBonus?: number;
}) {
  return withActionLog("rerateCaseQualityAction", input, async () => {
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
    if (!row) return { ok: false as const, error: "notfound" as const };
    if (row.status !== CaseStatus.AUDITED && row.status !== CaseStatus.ACCEPTED) {
      return { ok: false as const, error: "state" as const };
    }

    const priorRejectBySameAnnotator =
      row.annotatorId == null
        ? null
        : await prisma.review.findFirst({
            where: {
              annotationCaseId: row.id,
              decision: "REJECT",
              annotatorId: row.annotatorId,
            },
            select: { id: true },
          });
    const rushPercent = caseRushPercent({
      ...row,
      wasRejected: priorRejectBySameAnnotator != null,
    });

    let approvedBonus: number;
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
        rushPercent,
      );
      approvedBonus = suggestedQualityAdjustment(input.qualityRating, caseBase, {
        fiveStarBonusPercent: row.fiveStarBonusPercent ?? (await getProjectFiveStarBonusPercent(row.project)),
        wasResubmitted: priorRejectBySameAnnotator != null,
        at: row.auditedAt ?? new Date(),
      });
    }

    await prisma.annotationCase.update({
      where: { id: row.id },
      data: {
        qualityRating: input.qualityRating,
        annotatorBonus: approvedBonus,
        auditedAt: new Date(),
        auditedById: reviewer.id,
        status: CaseStatus.AUDITED,
      },
    });

    revalidatePath("/reviewer");
    revalidatePath("/annotator");
    return {
      ok: true as const,
      payout: computeCompensation(
        row.compensationType,
        row.compensationAmount,
        row.annotationMinutes,
        row.maxMinutesPerCase,
        row.minMinutesPerCase,
        approvedBonus,
        rushPercent,
      ),
    };
  });
}

export async function addCaseNoteAction(input: {
  caseDbId: string;
  content: string;
  imageDataList: string[];
  parentNoteId?: string | null;
  isQuestion?: boolean;
}) {
  return withActionLog("addCaseNoteAction", input, async () => {
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
  });
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
  await expireActiveCases();
  const bonuses = await getProjectQualityBonuses();
  const rows = await prisma.annotationCase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      guide: { select: { id: true, title: true } },
      ...caseTopicIncludeLite,
      annotator: { select: { id: true, name: true, email: true } },
      auditedBy: { select: { id: true, name: true, email: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          decision: true,
          comment: true,
          createdAt: true,
          annotatorId: true,
        },
      },
      _count: { select: { caseNotes: true } },
    },
  });
  return rows.map(row => ({ ...row, fiveStarBonusPercent: resolveCaseFiveStarBonusPercent(row.fiveStarBonusPercent, bonuses.get(row.project.trim())) }));
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
  deadline: string | null;
  createdAt: string;
  /** Prior reject by this annotator (urgency forfeited). */
  wasRejected: boolean;
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
        select: {
          reviews: {
            where: { decision: "REJECT", annotatorId: workspaceUserId },
          },
        },
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
      caseRushPercent({
        ...c,
        wasRejected: c._count.reviews > 0,
      }),
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
      project: c.project.trim() || "—",
      submittedAt: c.completedAt?.toISOString() ?? null,
      compensationType: c.compensationType,
      compensationAmount: c.compensationAmount,
      annotationMinutes: c.annotationMinutes,
      minMinutesPerCase: c.minMinutesPerCase,
      maxMinutesPerCase: c.maxMinutesPerCase,
      deadline: c.deadline?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      wasRejected: c._count.reviews > 0,
      wasResubmitted: resubmitPenaltyApplies(c._count.reviews > 0, acceptedAt),
      baseCompensation: round2(baseAmount),
      bonusCompensation: round2(bonusAmount),
      totalCompensation: round2(amount),
    });
    monthly.set(monthKey, monthPrev);

    const key = c.project.trim() || "—";
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

function annotatorCaseCountInclude(userId: string) {
  return {
    _count: {
      select: {
        caseNotes: true,
        reviews: {
          where: { decision: "REJECT" as const, annotatorId: userId },
        },
      },
    },
  } as const;
}

const annotatorReviewInclude = {
  reviews: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      decision: true,
      comment: true,
      createdAt: true,
      annotatorId: true,
    },
  },
  auditedBy: { select: { id: true, name: true, email: true } },
} as const;

export async function listCasesForAnnotator(userId: string) {
  await expireActiveCases();
  const bonuses = await getProjectQualityBonuses();
  const caseCounts = annotatorCaseCountInclude(userId);
  const [available, mine, rejected, reference] = await Promise.all([
    prisma.annotationCase.findMany({
      where: { status: CaseStatus.AVAILABLE, isReference: false },
      orderBy: { createdAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...caseCounts,
      },
    }),
    prisma.annotationCase.findMany({
      where: {
        annotatorId: userId,
        isReference: false,
        status: {
          in: [
            CaseStatus.ASSIGNED,
            CaseStatus.SUBMITTED,
            CaseStatus.ACCEPTED,
            CaseStatus.AUDITED,
            CaseStatus.EXPIRED,
            CaseStatus.ADMIN_COMPLETED,
            CaseStatus.PAUSED,
          ],
        },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorReviewInclude,
        ...caseCounts,
      },
    }),
    prisma.annotationCase.findMany({
      where: { annotatorId: userId, status: CaseStatus.REJECTED, isReference: false },
      orderBy: { updatedAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorReviewInclude,
        ...caseCounts,
      },
    }),
    prisma.annotationCase.findMany({
      where: { isReference: true },
      orderBy: { updatedAt: "desc" },
      include: {
        ...annotatorCaseListBase,
        ...annotatorReviewInclude,
        ...caseCounts,
      },
    }),
  ]);
  const all = [...available, ...mine, ...rejected, ...reference];
  const scopes = [...new Set(all.map((c) => c.scopeOfWork.trim()).filter(Boolean))];
  const templates = await prisma.scopeOfWorkTemplate.findMany({
    where: scopes.length ? { scopeOfWork: { in: scopes } } : undefined,
    select: {
      scopeOfWork: true,
      template: true,
      requireImagePerEntry: true,
      commentChoiceMode: true,
      commentChoices: true,
      commentFieldConfigs: true,
    },
  });
  const templateByScope = new Map(
    templates.map((t) => [t.scopeOfWork.trim(), t] as const),
  );
  function withTemplate<T extends { project: string; fiveStarBonusPercent: number | null; scopeOfWork: string; caseTopics: Parameters<typeof mapPrismaCaseTopics>[0] }>(
    rows: T[],
  ) {
    return rows.map((r) => {
      const { caseTopics, ...rest } = r;
      const tmpl = templateByScope.get(r.scopeOfWork.trim());
      return {
        ...rest,
        fiveStarBonusPercent: resolveCaseFiveStarBonusPercent(r.fiveStarBonusPercent, bonuses.get(r.project.trim())),
        topics: mapPrismaCaseTopics(caseTopics),
        scopeOfWorkTemplate: tmpl?.template ?? null,
        scopeOfWorkTemplateRequiresImages: tmpl?.requireImagePerEntry ?? false,
        commentChoiceMode: tmpl?.commentChoiceMode ?? "FREE",
        commentChoices: tmpl?.commentChoices ?? "",
        commentFieldConfigs: tmpl?.commentFieldConfigs ?? "[]",
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
