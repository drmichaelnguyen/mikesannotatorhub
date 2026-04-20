import type { CaseStatus, CompensationType, UserRole } from "@prisma/client";
import { getCaseNoteImages } from "@/lib/case-note-images";
import type { ReviewerCaseRow } from "@/lib/reviewer-types";

export type SerializedDiscussionNote = {
  id: string;
  parentNoteId: string | null;
  content: string | null;
  images: string[];
  createdAt: string;
  author: { name: string; role: UserRole };
};

export type SerializedReviewerCase = {
  id: string;
  caseId: string;
  redbrickProject: string;
  guide: { id: string; title: string; content: string } | null;
  topic:
    | { id: string; name: string; description: string | null; projects: { id: string; redbrickProject: string }[] }
    | null;
  guideline: string;
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
  status: CaseStatus;
  annotationMinutes: number | null;
  difficultyRating: number | null;
  assignedAt: string | null;
  completedAt: string | null;
  auditedAt: string | null;
  qualityRating: number | null;
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
    guide: c.guide
      ? {
          id: c.guide.id,
          title: c.guide.title,
          content: c.guide.content,
        }
      : null,
    topic: c.topic
      ? {
          id: c.topic.id,
          name: c.topic.name,
          description: c.topic.description,
          projects: c.topic.projects.map((p) => ({
            id: p.id,
            redbrickProject: p.redbrickProject,
          })),
        }
      : null,
    guideline: c.guideline,
    scopeOfWork: c.scopeOfWork,
    minMinutesPerCase: c.minMinutesPerCase,
    maxMinutesPerCase: c.maxMinutesPerCase,
    compensationType: c.compensationType,
    compensationAmount: c.compensationAmount,
    status: c.status,
    annotationMinutes: c.annotationMinutes,
    difficultyRating: c.difficultyRating,
    assignedAt: c.assignedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    auditedAt: c.auditedAt?.toISOString() ?? null,
    qualityRating: c.qualityRating,
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
      parentNoteId: n.parentNoteId,
      content: n.content,
      images: getCaseNoteImages(n),
      createdAt: n.createdAt.toISOString(),
      author: { name: n.author.name, role: n.author.role },
    })),
  };
}
