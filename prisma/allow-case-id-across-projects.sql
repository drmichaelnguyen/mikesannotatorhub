-- A case ID can be reused for a different scope of work or Redbrick project.
-- Only the exact case ID + scope + project combination is considered a duplicate.
DROP INDEX IF EXISTS "AnnotationCase_caseId_scopeOfWork_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AnnotationCase_caseId_scopeOfWork_redbrickProject_key"
  ON "AnnotationCase"("caseId", "scopeOfWork", "redbrickProject");
