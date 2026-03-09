-- AlterTable
ALTER TABLE "graph_versions"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "semantic_policies" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "diagramType" VARCHAR(80),
    "strictEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enforceOnServer" BOOLEAN NOT NULL DEFAULT true,
    "allowTechOverride" BOOLEAN NOT NULL DEFAULT false,
    "requireOverrideReason" BOOLEAN NOT NULL DEFAULT true,
    "customRulesJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByIdentity" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_event_logs" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "actorIdentity" VARCHAR(255),
    "eventType" VARCHAR(120) NOT NULL,
    "severity" VARCHAR(20),
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "semantic_policies_projectId_key" ON "semantic_policies"("projectId");

-- CreateIndex
CREATE INDEX "semantic_policies_projectId_updatedAt_idx" ON "semantic_policies"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "semantic_event_logs_projectId_createdAt_idx" ON "semantic_event_logs"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "semantic_policies"
ADD CONSTRAINT "semantic_policies_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_event_logs"
ADD CONSTRAINT "semantic_event_logs_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
