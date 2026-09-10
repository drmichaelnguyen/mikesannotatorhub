-- Preserve legacy behavior with NULL; new cases explicitly save their percentage.
ALTER TABLE "AnnotationCase" ADD COLUMN "fiveStarBonusPercent" REAL;
