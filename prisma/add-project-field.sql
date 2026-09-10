-- Short campaign/folder name for workboard grouping (BC2, BC3, …).
ALTER TABLE "AnnotationCase" ADD COLUMN IF NOT EXISTS "project" TEXT NOT NULL DEFAULT 'BC2';
