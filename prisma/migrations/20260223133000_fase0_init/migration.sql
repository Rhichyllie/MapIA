-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectTemplate" AS ENUM ('sitemap', 'flowchart', 'erd', 'graph');

-- CreateEnum
CREATE TYPE "NodeKind" AS ENUM ('workspace', 'project', 'entity', 'page', 'flow_step', 'note');

-- CreateEnum
CREATE TYPE "EdgeKind" AS ENUM ('contains', 'references', 'depends_on', 'flows_to', 'relates_to');

-- CreateEnum
CREATE TYPE "ExternalSystem" AS ENUM ('manual', 'postgres', 'prisma');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('workspace', 'project', 'graph_version', 'node', 'edge');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('created', 'updated', 'deleted', 'restored', 'imported', 'exported');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "ownerIdentity" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "template" "ProjectTemplate" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_versions" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" VARCHAR(200),
    "snapshot" JSONB NOT NULL,
    "viewport" JSONB NOT NULL,
    "createdByIdentity" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "NodeKind" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceNodeId" UUID NOT NULL,
    "targetNodeId" UUID NOT NULL,
    "kind" "EdgeKind" NOT NULL,
    "label" VARCHAR(200),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_refs" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "nodeId" UUID,
    "edgeId" UUID,
    "system" "ExternalSystem" NOT NULL,
    "externalId" VARCHAR(255) NOT NULL,
    "locator" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "projectId" UUID,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" VARCHAR(255) NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorIdentity" VARCHAR(255),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "projects_workspaceId_idx" ON "projects"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspaceId_slug_key" ON "projects"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "graph_versions_projectId_createdAt_idx" ON "graph_versions"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "graph_versions_projectId_versionNumber_key" ON "graph_versions"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "nodes_projectId_idx" ON "nodes"("projectId");

-- CreateIndex
CREATE INDEX "edges_projectId_idx" ON "edges"("projectId");

-- CreateIndex
CREATE INDEX "edges_sourceNodeId_idx" ON "edges"("sourceNodeId");

-- CreateIndex
CREATE INDEX "edges_targetNodeId_idx" ON "edges"("targetNodeId");

-- CreateIndex
CREATE INDEX "external_refs_projectId_idx" ON "external_refs"("projectId");

-- CreateIndex
CREATE INDEX "external_refs_nodeId_idx" ON "external_refs"("nodeId");

-- CreateIndex
CREATE INDEX "external_refs_edgeId_idx" ON "external_refs"("edgeId");

-- CreateIndex
CREATE UNIQUE INDEX "external_refs_projectId_system_externalId_nodeId_edgeId_key" ON "external_refs"("projectId", "system", "externalId", "nodeId", "edgeId");

-- CreateIndex
CREATE INDEX "audit_events_workspaceId_idx" ON "audit_events"("workspaceId");

-- CreateIndex
CREATE INDEX "audit_events_projectId_idx" ON "audit_events"("projectId");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_versions" ADD CONSTRAINT "graph_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_refs" ADD CONSTRAINT "external_refs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_refs" ADD CONSTRAINT "external_refs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_refs" ADD CONSTRAINT "external_refs_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "edges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

