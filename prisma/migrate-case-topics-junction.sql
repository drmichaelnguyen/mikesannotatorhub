-- Legacy one-file migration: SQLite often fails on ALTER TABLE ... DROP COLUMN "topicId"
-- when a FK still references it ("unknown column topicId in foreign key definition").
--
-- Prefer this sequence (preserves topic links):
--   1. prisma db execute --schema prisma/schema.prisma --file prisma/migrate-case-topics-junction.sql
--   2. prisma db push --accept-data-loss

CREATE TABLE IF NOT EXISTS "AnnotationCaseTopic" (
    "annotationCaseId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "AnnotationCaseTopic_pkey" PRIMARY KEY ("annotationCaseId","topicId"),
    CONSTRAINT "AnnotationCaseTopic_annotationCaseId_fkey" FOREIGN KEY ("annotationCaseId") REFERENCES "AnnotationCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnotationCaseTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AnnotationCaseTopic_topicId_idx" ON "AnnotationCaseTopic"("topicId");

INSERT OR IGNORE INTO "AnnotationCaseTopic" ("annotationCaseId", "topicId")
SELECT "id", "topicId" FROM "AnnotationCase" WHERE "topicId" IS NOT NULL;
