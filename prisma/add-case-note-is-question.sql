-- SQLite: add optional question flag on case notes (run before/with Prisma sync if needed)
ALTER TABLE "CaseNote" ADD COLUMN "isQuestion" BOOLEAN NOT NULL DEFAULT false;
