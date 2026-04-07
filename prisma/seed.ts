import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { GraphSnapshotSchema } from "../src/domain";
import { assertAuthStorageReady } from "../src/server/auth/auth-storage-readiness";

const prisma = new PrismaClient();

async function main() {
  await assertAuthStorageReady({
    rawQueryDelegate: prisma,
    databaseUrl: process.env.DATABASE_URL,
    useCache: false,
  });

  const [seedUser] = await prisma.$queryRaw<
    Array<{
      id: string;
      email: string;
    }>
  >(
    Prisma.sql`
      INSERT INTO "app_users" (
        "id",
        "email",
        "emailNormalized",
        "displayName",
        "active",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()}::uuid,
        'admin@mapia.local',
        'admin@mapia.local',
        'MapIA Development Admin',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("emailNormalized")
      DO UPDATE SET
        "email" = EXCLUDED."email",
        "displayName" = EXCLUDED."displayName",
        "active" = true,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "email"
    `,
  );

  const workspace = await prisma.workspace.upsert({
    where: { slug: "mapia-demo" },
    update: {
      name: "MapIA Demo Workspace",
    },
    create: {
      slug: "mapia-demo",
      name: "MapIA Demo Workspace",
      ownerIdentity: "admin@mapia.local",
    },
  });

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "workspace_memberships" (
        "id",
        "workspaceId",
        "userId",
        "role",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${workspace.id}::uuid,
        ${seedUser.id}::uuid,
        'owner'::"WorkspaceRole",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("workspaceId", "userId")
      DO UPDATE SET
        "role" = 'owner'::"WorkspaceRole",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
  );

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "auth_identities" (
        "id",
        "userId",
        "providerType",
        "providerId",
        "subject",
        "emailAtLogin",
        "createdAt",
        "updatedAt",
        "lastSeenAt"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${seedUser.id}::uuid,
        'development_credentials'::"AuthProviderType",
        'credentials',
        'admin@mapia.local',
        'admin@mapia.local',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("providerId", "subject")
      DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "emailAtLogin" = EXCLUDED."emailAtLogin",
        "lastSeenAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
    `,
  );

  const project = await prisma.project.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: "onboarding-flow",
      },
    },
    update: {
      name: "Onboarding Flow",
      template: "flowchart",
      description: "Projeto seeded para bootstrap local do MapIA.",
    },
    create: {
      workspaceId: workspace.id,
      slug: "onboarding-flow",
      name: "Onboarding Flow",
      template: "flowchart",
      description: "Projeto seeded para bootstrap local do MapIA.",
    },
  });

  const seedSnapshot = GraphSnapshotSchema.parse({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });

  await prisma.graphVersion.upsert({
    where: {
      projectId_versionNumber: {
        projectId: project.id,
        versionNumber: 1,
      },
    },
    update: {},
    create: {
      projectId: project.id,
      versionNumber: 1,
      label: "seed-initial",
      snapshot: seedSnapshot as unknown as Prisma.InputJsonObject,
      viewport: seedSnapshot.viewport as unknown as Prisma.InputJsonObject,
      createdByIdentity: "seed",
    },
  });

  console.log(
    `Seed concluido: user=${seedUser.email} workspace=${workspace.slug} project=${project.slug} version=1`,
  );
}

main()
  .catch((error) => {
    console.error("Falha no seed do Prisma:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
