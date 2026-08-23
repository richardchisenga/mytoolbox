-- Production hardening: add administrator role and fields already present in the application model.
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "subtopic" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "teacherEvaluation" TEXT;
ALTER TABLE "Scheme" ADD COLUMN IF NOT EXISTS "weekTopics" JSONB;
