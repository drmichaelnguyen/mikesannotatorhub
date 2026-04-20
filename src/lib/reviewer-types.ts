import type { AnnotationCase, CaseNote, Guide, Review, Topic, TopicProject, User } from "@prisma/client";

export type ReviewerCaseRow = AnnotationCase & {
  guide: Pick<Guide, "id" | "title" | "content"> | null;
  topic: (Pick<Topic, "id" | "name" | "description"> & {
    projects: Pick<TopicProject, "id" | "redbrickProject">[];
  }) | null;
  annotator: User | null;
  auditedBy: Pick<User, "id" | "name" | "email"> | null;
  reviews: Review[];
  caseNotes: (CaseNote & { author: Pick<User, "id" | "name" | "role"> })[];
};
