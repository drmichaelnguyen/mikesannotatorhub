import type { AnnotationCase, Guide, Review, Topic, TopicProject, TopicScope, User } from "@prisma/client";

export type ReviewerCaseRow = AnnotationCase & {
  guide: Pick<Guide, "id" | "title"> | null;
  caseTopics: {
    topic: Pick<Topic, "id" | "name" | "description"> & {
      projects: Pick<TopicProject, "id" | "redbrickProject">[];
      scopes: Pick<TopicScope, "id" | "scopeOfWork">[];
    };
  }[];
  annotator: Pick<User, "id" | "name" | "email"> | null;
  auditedBy: Pick<User, "id" | "name" | "email"> | null;
  reviews: Pick<Review, "id" | "decision" | "comment" | "createdAt">[];
  _count: { caseNotes: number };
};
