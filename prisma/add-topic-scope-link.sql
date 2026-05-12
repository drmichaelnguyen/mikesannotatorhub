-- Add scope-of-work linkage for topics.
CREATE TABLE IF NOT EXISTS "TopicScope" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "topicId" TEXT NOT NULL,
  "scopeOfWork" TEXT NOT NULL,
  CONSTRAINT "TopicScope_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TopicScope_topicId_scopeOfWork_key" ON "TopicScope"("topicId", "scopeOfWork");
CREATE INDEX IF NOT EXISTS "TopicScope_scopeOfWork_idx" ON "TopicScope"("scopeOfWork");
