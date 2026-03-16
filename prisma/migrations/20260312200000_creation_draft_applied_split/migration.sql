ALTER TABLE "project_creation_settings"
ADD COLUMN "appliedSettings" JSONB,
ADD COLUMN "appliedVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "appliedAt" TIMESTAMP(3),
ADD COLUMN "appliedByIdentity" VARCHAR(255);

CREATE TABLE "project_creation_drafts" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "draftPayloadJson" JSONB NOT NULL,
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedByIdentity" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_creation_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_creation_drafts_projectId_key" ON "project_creation_drafts"("projectId");
CREATE INDEX "project_creation_drafts_projectId_idx" ON "project_creation_drafts"("projectId");

ALTER TABLE "project_creation_drafts"
ADD CONSTRAINT "project_creation_drafts_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH redacted_settings AS (
  SELECT
    pcs."projectId",
    jsonb_strip_nulls(
      jsonb_build_object(
        'profile', pcs."profile",
        'startStrategy', pcs."startStrategy",
        'startSource', pcs."startSource",
        'templatePreset', pcs."templatePreset",
        'initialView', pcs."initialView",
        'layout', pcs."layout",
        'detailLevel', pcs."detailLevel",
        'sourceConfig',
          CASE
            WHEN pcs."sourceConfig" IS NULL THEN NULL
            WHEN jsonb_typeof(pcs."sourceConfig") = 'object'
              THEN pcs."sourceConfig"
                - 'connectionString'
                - 'password'
                - 'token'
                - 'secret'
                - 'apiKey'
                - 'api_key'
                - 'bearer'
                - 'authorization'
            ELSE pcs."sourceConfig"
          END,
        'automation', pcs."automation",
        'context', pcs."context"
      )
    ) AS applied
  FROM "project_creation_settings" pcs
)
UPDATE "project_creation_settings" pcs
SET
  "appliedSettings" = redacted_settings.applied,
  "appliedAt" = COALESCE(pcs."appliedAt", pcs."updatedAt")
FROM redacted_settings
WHERE redacted_settings."projectId" = pcs."projectId";

INSERT INTO "project_creation_drafts" (
  "id",
  "projectId",
  "draftPayloadJson",
  "draftVersion",
  "updatedByIdentity",
  "createdAt",
  "updatedAt"
)
SELECT
  pcs."id",
  pcs."projectId",
  COALESCE(
    CASE
      WHEN pcs."draftPayload" IS NULL THEN NULL
      WHEN jsonb_typeof(pcs."draftPayload") = 'object' AND pcs."draftPayload" ? 'sourceConfig'
        THEN jsonb_set(
          pcs."draftPayload",
          '{sourceConfig}',
          CASE
            WHEN jsonb_typeof(pcs."draftPayload"->'sourceConfig') = 'object'
              THEN (pcs."draftPayload"->'sourceConfig')
                - 'connectionString'
                - 'password'
                - 'token'
                - 'secret'
                - 'apiKey'
                - 'api_key'
                - 'bearer'
                - 'authorization'
            ELSE COALESCE(pcs."draftPayload"->'sourceConfig', '{}'::jsonb)
          END,
          true
        )
      ELSE pcs."draftPayload"
    END,
    pcs."appliedSettings",
    '{}'::jsonb
  ) AS "draftPayloadJson",
  COALESCE(pcs."draftVersion", 1) AS "draftVersion",
  NULL AS "updatedByIdentity",
  pcs."createdAt",
  COALESCE(pcs."draftUpdatedAt", pcs."updatedAt")
FROM "project_creation_settings" pcs
WHERE COALESCE(pcs."draftPayload", pcs."appliedSettings") IS NOT NULL
ON CONFLICT ("projectId") DO NOTHING;
