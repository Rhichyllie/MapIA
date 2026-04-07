DO $$
BEGIN
  IF to_regclass('"app_users"') IS NULL
    OR to_regclass('"auth_identities"') IS NULL
    OR to_regclass('"workspace_memberships"') IS NULL THEN
    RAISE EXCEPTION
      'MapIA auth storage rollout guardrails require app_users, auth_identities and workspace_memberships before UUID integrity verification.';
  END IF;
END
$$;

CREATE TEMP TABLE "_mapia_rollout_invalid_app_user_ids" AS
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
FROM "_mapia_rollout_invalid_app_user_ids" "repair"
WHERE "app_users"."id" = "repair"."oldId";

UPDATE "audit_events" "audit_events"
SET "actorUserId" = "repair"."newId"
FROM "_mapia_rollout_invalid_app_user_ids" "repair"
WHERE "audit_events"."actorUserId" = "repair"."oldId";

CREATE TEMP TABLE "_mapia_rollout_invalid_auth_identity_ids" AS
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
FROM "_mapia_rollout_invalid_auth_identity_ids" "repair"
WHERE "auth_identities"."id" = "repair"."oldId";

CREATE TEMP TABLE "_mapia_rollout_invalid_workspace_membership_ids" AS
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
FROM "_mapia_rollout_invalid_workspace_membership_ids" "repair"
WHERE "workspace_memberships"."id" = "repair"."oldId";

DO $$
DECLARE
  invalid_summary text;
BEGIN
  SELECT string_agg("checkId" || '=' || "invalidCount", ', ')
  INTO invalid_summary
  FROM (
    SELECT
      'app_users.id' AS "checkId",
      COUNT(*)::int AS "invalidCount"
    FROM "app_users"
    WHERE "id"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    UNION ALL
    SELECT
      'auth_identities.id' AS "checkId",
      COUNT(*)::int AS "invalidCount"
    FROM "auth_identities"
    WHERE "id"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    UNION ALL
    SELECT
      'auth_identities.userId' AS "checkId",
      COUNT(*)::int AS "invalidCount"
    FROM "auth_identities"
    WHERE "userId"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    UNION ALL
    SELECT
      'workspace_memberships.id' AS "checkId",
      COUNT(*)::int AS "invalidCount"
    FROM "workspace_memberships"
    WHERE "id"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    UNION ALL
    SELECT
      'workspace_memberships.userId' AS "checkId",
      COUNT(*)::int AS "invalidCount"
    FROM "workspace_memberships"
    WHERE "userId"::text !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
  ) AS "integrity"
  WHERE "invalidCount" > 0;

  IF invalid_summary IS NOT NULL THEN
    RAISE EXCEPTION
      'MapIA auth storage UUID integrity remains invalid after rollout guardrail migration: %',
      invalid_summary;
  END IF;
END
$$;
