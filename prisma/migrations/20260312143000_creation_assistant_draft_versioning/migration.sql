ALTER TABLE "project_creation_settings"
ADD COLUMN "draftPayload" JSONB,
ADD COLUMN "draftVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "draftUpdatedAt" TIMESTAMP(3);
