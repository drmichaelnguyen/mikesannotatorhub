-- Prisma Json columns must contain valid JSON. Empty string breaks reads.
-- Run after adding videoGuideUrls if existing rows were backfilled as ''.
UPDATE "AnnotationCase"
SET "videoGuideUrls" = '[]'
WHERE "videoGuideUrls" IS NULL OR "videoGuideUrls" = '';
