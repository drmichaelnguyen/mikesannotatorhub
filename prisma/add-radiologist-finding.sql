-- Radiologist finding(s) for a study / case.
ALTER TABLE "AnnotationCase" ADD COLUMN "radiologistFinding" TEXT NOT NULL DEFAULT '';
