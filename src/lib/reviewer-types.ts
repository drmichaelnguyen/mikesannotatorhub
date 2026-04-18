import type { AnnotationCase, CaseNote, Review, User } from "@prisma/client";

export type ReviewerCaseRow = AnnotationCase & {
  annotator: User | null;
  auditedBy: Pick<User, "id" | "name" | "email"> | null;
  reviews: Review[];
  caseNotes: (CaseNote & { author: Pick<User, "id" | "name" | "role"> })[];
};
