DO $$
BEGIN
  CREATE TYPE "AuthProviderType" AS ENUM ('development_credentials', 'oidc');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "app_users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "emailNormalized" VARCHAR(255) NOT NULL,
  "displayName" VARCHAR(120),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_users_emailNormalized_key"
  ON "app_users"("emailNormalized");

CREATE INDEX IF NOT EXISTS "app_users_emailNormalized_idx"
  ON "app_users"("emailNormalized");

CREATE TABLE IF NOT EXISTS "auth_identities" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "providerType" "AuthProviderType" NOT NULL,
  "providerId" VARCHAR(80) NOT NULL,
  "subject" VARCHAR(255) NOT NULL,
  "emailAtLogin" VARCHAR(255),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3),

  CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_identities_providerId_subject_key"
  ON "auth_identities"("providerId", "subject");

CREATE INDEX IF NOT EXISTS "auth_identities_userId_idx"
  ON "auth_identities"("userId");

CREATE TABLE IF NOT EXISTS "workspace_memberships" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "WorkspaceRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_memberships_workspaceId_userId_key"
  ON "workspace_memberships"("workspaceId", "userId");

CREATE INDEX IF NOT EXISTS "workspace_memberships_userId_idx"
  ON "workspace_memberships"("userId");

CREATE INDEX IF NOT EXISTS "workspace_memberships_workspaceId_role_idx"
  ON "workspace_memberships"("workspaceId", "role");

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "app_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_memberships"
  ADD CONSTRAINT "workspace_memberships_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_memberships"
  ADD CONSTRAINT "workspace_memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "app_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "actorUserId" UUID;

CREATE INDEX IF NOT EXISTS "audit_events_actorUserId_idx"
  ON "audit_events"("actorUserId");

INSERT INTO "app_users" (
  "id",
  "email",
  "emailNormalized",
  "displayName",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  (
    substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 12)
  )::uuid,
  trim("ownerIdentity"),
  lower(trim("ownerIdentity")),
  trim("ownerIdentity"),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces"
WHERE "ownerIdentity" IS NOT NULL
  AND length(trim("ownerIdentity")) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "app_users" "existing_user"
    WHERE "existing_user"."emailNormalized" = lower(trim("workspaces"."ownerIdentity"))
  );

INSERT INTO "workspace_memberships" (
  "id",
  "workspaceId",
  "userId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  (
    substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text), 1, 12)
  )::uuid,
  "workspaces"."id",
  "app_users"."id",
  'owner'::"WorkspaceRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces"
INNER JOIN "app_users"
  ON "app_users"."emailNormalized" = lower(trim("workspaces"."ownerIdentity"))
WHERE "workspaces"."ownerIdentity" IS NOT NULL
  AND length(trim("workspaces"."ownerIdentity")) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "workspace_memberships" "existing_membership"
    WHERE "existing_membership"."workspaceId" = "workspaces"."id"
      AND "existing_membership"."userId" = "app_users"."id"
  );
