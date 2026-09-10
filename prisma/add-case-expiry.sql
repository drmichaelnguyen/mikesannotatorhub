ALTER TABLE "AnnotationCase" ADD COLUMN "expiresAt" DATETIME;
CREATE INDEX "AnnotationCase_status_expiresAt_idx"
  ON "AnnotationCase"("status", "expiresAt");
