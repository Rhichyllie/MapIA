CREATE TEMP TABLE "_mapia_invalid_app_user_ids" AS
SELECT
  "id" AS "oldId",
  (
    substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 8) || '-' ||
    substr(md5(random()::text || "id"::text || clock_timestamp()::text), 1, 4) || '-' ||
    '4' || substr(md5(clock_timestamp()::text || "id"::text || random()::text), 2, 3) || '-' ||
    '8' || substr(md5(random()::text || clock_timestamp()::text || "id"::text), 2, 3) || '-' ||
    substr(md5("id"::text || random()::text || clock_timestamp()::text), 1, 12)
  )::uuid AS "newId"
FROM "app_users"
WHERE "id"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';

UPDATE "app_users" "app_users"
SET "id" = "repair"."newId"
FROM "_mapia_invalid_app_user_ids" "repair"
WHERE "app_users"."id" = "repair"."oldId";

UPDATE "audit_events" "audit_events"
SET "actorUserId" = "repair"."newId"
FROM "_mapia_invalid_app_user_ids" "repair"
WHERE "audit_events"."actorUserId" = "repair"."oldId";

CREATE TEMP TABLE "_mapia_invalid_auth_identity_ids" AS
SELECT
  "id" AS "oldId",
  (
    substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 8) || '-' ||
    substr(md5(random()::text || "id"::text || clock_timestamp()::text), 1, 4) || '-' ||
    '4' || substr(md5(clock_timestamp()::text || "id"::text || random()::text), 2, 3) || '-' ||
    '8' || substr(md5(random()::text || clock_timestamp()::text || "id"::text), 2, 3) || '-' ||
    substr(md5("id"::text || random()::text || clock_timestamp()::text), 1, 12)
  )::uuid AS "newId"
FROM "auth_identities"
WHERE "id"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';

UPDATE "auth_identities" "auth_identities"
SET "id" = "repair"."newId"
FROM "_mapia_invalid_auth_identity_ids" "repair"
WHERE "auth_identities"."id" = "repair"."oldId";

CREATE TEMP TABLE "_mapia_invalid_workspace_membership_ids" AS
SELECT
  "id" AS "oldId",
  (
    substr(md5("id"::text || clock_timestamp()::text || random()::text), 1, 8) || '-' ||
    substr(md5(random()::text || "id"::text || clock_timestamp()::text), 1, 4) || '-' ||
    '4' || substr(md5(clock_timestamp()::text || "id"::text || random()::text), 2, 3) || '-' ||
    '8' || substr(md5(random()::text || clock_timestamp()::text || "id"::text), 2, 3) || '-' ||
    substr(md5("id"::text || random()::text || clock_timestamp()::text), 1, 12)
  )::uuid AS "newId"
FROM "workspace_memberships"
WHERE "id"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';

UPDATE "workspace_memberships" "workspace_memberships"
SET "id" = "repair"."newId"
FROM "_mapia_invalid_workspace_membership_ids" "repair"
WHERE "workspace_memberships"."id" = "repair"."oldId";
