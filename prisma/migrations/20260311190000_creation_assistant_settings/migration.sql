-- CreateTable
CREATE TABLE "project_creation_settings" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "profile" VARCHAR(80),
    "startStrategy" VARCHAR(80),
    "startSource" VARCHAR(80),
    "templatePreset" VARCHAR(80),
    "initialView" VARCHAR(80),
    "layout" VARCHAR(80),
    "detailLevel" VARCHAR(80),
    "sourceConfig" JSONB,
    "automation" JSONB,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_creation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_creation_settings_projectId_key" ON "project_creation_settings"("projectId");

-- CreateIndex
CREATE INDEX "project_creation_settings_projectId_idx" ON "project_creation_settings"("projectId");

-- AddForeignKey
ALTER TABLE "project_creation_settings"
ADD CONSTRAINT "project_creation_settings_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
