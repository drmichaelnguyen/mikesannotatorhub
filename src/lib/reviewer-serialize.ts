import type { CaseStatus, CompensationType } from "@prisma/client";
import { caseWasResubmitted, resubmitPenaltyApplies } from "@/lib/compensation";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";
import { videoGuideUrlsFromDb } from "@/lib/video-guides";

export type SerializedCaseTopic = {
  id: string;
  name: string;
  description: string | null;
  projects: { id: string; redbrickProject: string }[];
  scopes: { id: string; scopeOfWork: string }[];
};

export function mapPrismaCaseTopics(
  rows: {
    topic: {
      id: string;
      name: string;
      description?: string | null;
      projects: { id: string; redbrickProject: string }[];
      scopes: { id: string; scopeOfWork: string }[];
    };
  }[],
): SerializedCaseTopic[] {
  return rows.map((r) => ({
    id: r.topic.id,
    name: r.topic.name,
    description: r.topic.description ?? null,
    projects: r.topic.projects.map((p) => ({ id: p.id, redbrickProject: p.redbrickProject })),
    scopes: r.topic.scopes.map((s) => ({ id: s.id, scopeOfWork: s.scopeOfWork })),
  }));
}

export type SerializedReviewerCase = {
  id: string;
  caseId: string;
  project: string;
  fiveStarBonusPercent?: number;
  redbrickProject: string;
  guide: { id: string; title: string } | null;
  topics: SerializedCaseTopic[];
  guideline: string;
  radiologistFinding: string;
  videoGuideUrls: string[];
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
  annotatorBonus: number;
  status: CaseStatus;
  annotationMinutes: number | null;
  difficultyRating: number | null;
  assignedAt: string | null;
  completedAt: string | null;
  auditedAt: string | null;
  qualityRating: number | null;
  isReference: boolean;
  hasContinuityReport: boolean;
  deadline: string | null;
  expiresAt: string | null;
  createdAt: string;
  annotator: { id: string; name: string; email: string } | null;
  auditedBy: { id: string; name: string; email: string } | null;
  reviews: {
    id: string;
    decision: string;
    comment: string | null;
    createdAt: string;
    annotatorId: string | null;
  }[];
  caseNoteCount: number;
  wasResubmitted: boolean;
};

export function serializeReviewerCase(c: ReviewerCaseRow): SerializedReviewerCase {
  return {
    id: c.id,
    caseId: c.caseId,
    project: c.project,
    fiveStarBonusPercent: c.fiveStarBonusPercent,
    redbrickProject: c.redbrickProject,
    guide: c.guide ? { id: c.guide.id, title: c.guide.title } : null,
    topics: mapPrismaCaseTopics(c.caseTopics),
    guideline: c.guideline,
    radiologistFinding: c.radiologistFinding,
    videoGuideUrls: videoGuideUrlsFromDb(c.videoGuideUrls),
    scopeOfWork: c.scopeOfWork,
    minMinutesPerCase: c.minMinutesPerCase,
    maxMinutesPerCase: c.maxMinutesPerCase,
    compensationType: c.compensationType,
    compensationAmount: c.compensationAmount,
    annotatorBonus: c.annotatorBonus,
    status: c.status,
    annotationMinutes: c.annotationMinutes,
    difficultyRating: c.difficultyRating,
    assignedAt: c.assignedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    auditedAt: c.auditedAt?.toISOString() ?? null,
    qualityRating: c.qualityRating,
    isReference: c.isReference,
    hasContinuityReport: c.hasContinuityReport,
    deadline: c.deadline?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    annotator: c.annotator
      ? { id: c.annotator.id, name: c.annotator.name, email: c.annotator.email }
      : null,
    auditedBy: c.auditedBy
      ? { id: c.auditedBy.id, name: c.auditedBy.name, email: c.auditedBy.email }
      : null,
    reviews: c.reviews.map((r) => ({
      id: r.id,
      decision: r.decision,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      annotatorId: r.annotatorId,
    })),
    caseNoteCount: c._count.caseNotes,
    // Same-annotator resubmit only; penalty from July 2026 UTC (pending reviews use "now").
    wasResubmitted: resubmitPenaltyApplies(
      caseWasResubmitted(c.reviews, c.annotatorId),
      c.auditedAt,
    ),
  };
}
