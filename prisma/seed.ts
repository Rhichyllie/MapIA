import { Prisma, PrismaClient } from "@prisma/client";
import { GraphSnapshotSchema } from "../src/domain";

const prisma = new PrismaClient();

async function main() {
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
    `Seed concluido: workspace=${workspace.slug} project=${project.slug} version=1`,
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
