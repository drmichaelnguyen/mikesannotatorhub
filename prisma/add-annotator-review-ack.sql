-- Run once if the DB predates Prisma schema sync:
-- sqlite3 prisma/dev.db < prisma/add-annotator-review-ack.sql
ALTER TABLE "AnnotationCase" ADD COLUMN "annotatorAcknowledgedReviewId" TEXT;
