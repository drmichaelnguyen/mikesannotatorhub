"use server";

import { getReviewerNotificationRecipients, pushNotification } from "@/app/actions/notifications";
import { requireAnnotatorWorkspace } from "@/lib/annotator-workspace";
import { requireRole } from "@/lib/auth";
import { NOTIF } from "@/lib/notification-types";
import { prisma } from "@/lib/prisma";

export type AnnotatorRedbrickFlagRow = {
  caseDbId: string;
  flagId: string;
  createdAt: string;
};

export type ReviewerRedbrickFlagRow = {
  id: string;
  caseDbId: string;
  caseId: string;
  redbrickProject: string;
  scopeOfWork: string;
  hubStatus: string;
  hubAnnotatorName: string | null;
  flaggedByName: string;
  flaggedByEmail: string;
  comment: string | null;
  createdAt: string;
};

export async function getAnnotatorRedbrickFlags(): Promise<AnnotatorRedbrickFlagRow[]> {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const rows = await prisma.caseRedbrickFlag.findMany({
    where: { flaggedById: workspaceUserId, resolvedAt: null },
    select: { id: true, annotationCaseId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    caseDbId: r.annotationCaseId,
    flagId: r.id,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function flagRedbrickAssignmentAction(input: {
  caseDbId: string;
  comment?: string;
}) {
  const { workspaceUserId } = await requireAnnotatorWorkspace();
  const comment = input.comment?.trim() || null;

  const row = await prisma.annotationCase.findUnique({
    where: { id: input.caseDbId },
    select: { id: true, caseId: true, isReference: true, status: true, annotatorId: true },
  });
  if (!row || row.isReference) {
    return { ok: false as const, error: "not_found" as const };
  }

  const canFlag =
    row.status === "AVAILABLE" ||
    row.annotatorId === workspaceUserId;
  if (!canFlag) {
    return { ok: false as const, error: "forbidden" as const };
  }

  const existing = await prisma.caseRedbrickFlag.findFirst({
    where: {
      annotationCaseId: input.caseDbId,
      flaggedById: workspaceUserId,
      resolvedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false as const, error: "already_flagged" as const };
  }

  await prisma.caseRedbrickFlag.create({
    data: {
      annotationCaseId: input.caseDbId,
      flaggedById: workspaceUserId,
      comment,
    },
  });

  const reviewerIds = await getReviewerNotificationRecipients();
  await pushNotification(reviewerIds, NOTIF.REDBRICK_FLAG, row.id, row.caseId);

  return { ok: true as const };
}

export async function listUnresolvedRedbrickFlagsAction(): Promise<ReviewerRedbrickFlagRow[]> {
  await requireRole("REVIEWER");
  const rows = await prisma.caseRedbrickFlag.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      comment: true,
      createdAt: true,
      flaggedBy: { select: { name: true, email: true } },
      annotationCase: {
        select: {
          id: true,
          caseId: true,
          redbrickProject: true,
          scopeOfWork: true,
          status: true,
          annotator: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    caseDbId: r.annotationCase.id,
    caseId: r.annotationCase.caseId,
    redbrickProject: r.annotationCase.redbrickProject,
    scopeOfWork: r.annotationCase.scopeOfWork,
    hubStatus: r.annotationCase.status,
    hubAnnotatorName: r.annotationCase.annotator?.name ?? null,
    flaggedByName: r.flaggedBy.name,
    flaggedByEmail: r.flaggedBy.email,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function resolveRedbrickFlagAction(flagId: string) {
  const user = await requireRole("REVIEWER");
  const updated = await prisma.caseRedbrickFlag.updateMany({
    where: { id: flagId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });
  if (updated.count === 0) {
    return { ok: false as const, error: "not_found" as const };
  }
  return { ok: true as const };
}
