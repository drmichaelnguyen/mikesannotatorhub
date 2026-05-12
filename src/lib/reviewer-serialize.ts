import type { CaseStatus, CompensationType } from "@prisma/client";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";
import { videoGuideUrlsFromDb } from "@/lib/video-guides";

export type SerializedReviewerCase = {
  id: string;
  caseId: string;
  redbrickProject: string;
  guide: { id: string; title: string } | null;
  topic:
    | {
        id: string;
        name: string;
        description: string | null;
        projects: { id: string; redbrickProject: string }[];
        scopes: { id: string; scopeOfWork: string }[];
      }
    | null;
  guideline: string;
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
  annotator: { id: string; name: string; email: string } | null;
  auditedBy: { id: string; name: string; email: string } | null;
  reviews: { id: string; decision: string; comment: string | null; createdAt: string }[];
  caseNoteCount: number;
};

export function serializeReviewerCase(c: ReviewerCaseRow): SerializedReviewerCase {
  return {
    id: c.id,
    caseId: c.caseId,
    redbrickProject: c.redbrickProject,
    guide: c.guide ? { id: c.guide.id, title: c.guide.title } : null,
    topic: c.topic
      ? {
          id: c.topic.id,
          name: c.topic.name,
          description: c.topic.description,
          projects: c.topic.projects.map((p) => ({
            id: p.id,
            redbrickProject: p.redbrickProject,
          })),
          scopes: c.topic.scopes.map((s) => ({
            id: s.id,
            scopeOfWork: s.scopeOfWork,
          })),
        }
      : null,
    guideline: c.guideline,
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
    })),
    caseNoteCount: c._count.caseNotes,
  };
}
