import type { CaseStatus, CompensationType, UserRole } from "@prisma/client";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";

export type SerializedDiscussionNote = {
  id: string;
  content: string | null;
  imageData: string | null;
  createdAt: string;
  author: { name: string; role: UserRole };
};

export type SerializedReviewerCase = {
  id: string;
  caseId: string;
  redbrickProject: string;
  guideline: string;
  scopeOfWork: string;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
  status: CaseStatus;
  annotationMinutes: number | null;
  assignedAt: string | null;
  completedAt: string | null;
  auditedAt: string | null;
  annotator: { id: string; name: string; email: string } | null;
  auditedBy: { id: string; name: string; email: string } | null;
  reviews: { id: string; decision: string; comment: string | null; createdAt: string }[];
  caseNotes: SerializedDiscussionNote[];
};

export function serializeReviewerCase(c: ReviewerCaseRow): SerializedReviewerCase {
  return {
    id: c.id,
    caseId: c.caseId,
    redbrickProject: c.redbrickProject,
    guideline: c.guideline,
    scopeOfWork: c.scopeOfWork,
    maxMinutesPerCase: c.maxMinutesPerCase,
    compensationType: c.compensationType,
    compensationAmount: c.compensationAmount,
    status: c.status,
    annotationMinutes: c.annotationMinutes,
    assignedAt: c.assignedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    auditedAt: c.auditedAt?.toISOString() ?? null,
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
    caseNotes: c.caseNotes.map((n) => ({
      id: n.id,
      content: n.content,
      imageData: n.imageData,
      createdAt: n.createdAt.toISOString(),
      author: { name: n.author.name, role: n.author.role },
    })),
  };
}
