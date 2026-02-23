-- CreateEnum
CREATE TYPE "WizardDraftStatus" AS ENUM ('draft', 'validating', 'generating', 'ready', 'error');

-- CreateEnum
CREATE TYPE "WizardStep" AS ENUM ('template', 'diagram_type', 'data_source', 'config', 'review');

-- CreateTable
CREATE TABLE "wizard_drafts" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "status" "WizardDraftStatus" NOT NULL DEFAULT 'draft',
  "currentStep" "WizardStep" NOT NULL DEFAULT 'template',
  "payload" JSONB NOT NULL,
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "wizard_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wizard_drafts_projectId_key" ON "wizard_drafts"("projectId");

-- CreateIndex
CREATE INDEX "wizard_drafts_projectId_idx" ON "wizard_drafts"("projectId");

-- AddForeignKey
ALTER TABLE "wizard_drafts" ADD CONSTRAINT "wizard_drafts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
