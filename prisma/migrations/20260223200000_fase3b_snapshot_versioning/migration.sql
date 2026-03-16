-- CreateEnum
CREATE TYPE "SnapshotVersionOrigin" AS ENUM ('manual');

-- CreateTable
CREATE TABLE "editor_snapshot_versions" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "snapshot" JSONB NOT NULL,
  "label" VARCHAR(200),
  "origin" "SnapshotVersionOrigin" NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "editor_snapshot_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "editor_snapshot_versions_projectId_idx" ON "editor_snapshot_versions"("projectId");

-- CreateIndex
CREATE INDEX "editor_snapshot_versions_projectId_createdAt_idx" ON "editor_snapshot_versions"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "editor_snapshot_versions" ADD CONSTRAINT "editor_snapshot_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
