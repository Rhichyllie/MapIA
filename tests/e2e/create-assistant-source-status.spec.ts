import { expect, test } from "./fixtures";

test("UI mostra status honesto para DB configuravel: pronta para tentar importar", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/create");
  await expect(
    authenticatedPage.getByTestId("creation-assistant-shell"),
  ).toBeVisible();

  await authenticatedPage.locator("#assistant-project-name").fill("E2E Source Status DB");
  await authenticatedPage.getByRole("button", { name: "Continuar" }).click();
  await authenticatedPage
    .getByRole("button", { name: /Modelo de dados/i })
    .first()
    .click();
  await authenticatedPage.getByRole("button", { name: "Continuar" }).click();

  await authenticatedPage
    .getByRole("button", { name: /Importar do sistema/i })
    .first()
    .click();

  await authenticatedPage
    .locator("#origin-db-connection-string")
    .fill("postgresql://reader:secret@db.internal:5432/mapia");

  await expect(
    authenticatedPage.locator(".badge", {
      hasText: "Pronta para tentar importar",
    }),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(/Importada com sucesso/i),
  ).toHaveCount(0);
});

test("status muda para importada apenas apos importacao real", async ({
  authenticatedPage,
}) => {
  const createResponse = await authenticatedPage.request.post(
    "/api/projects/create-with-assistant",
    {
      data: {
        projectName: `E2E Source Imported ${Date.now()}`,
        profile: "data-model",
        startStrategy: "import",
        startSource: "prisma-schema",
        sourceConfig: {
          kind: "prisma-schema",
          inputMode: "paste",
          schemaText: "model User { id String @id email String }",
        },
        initialView: "erd",
        layout: "relational",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {
          setup: {
            createExamples: true,
            suggestedBlockCount: 3,
            createInitialRoot: false,
            initialRootName: "Nucleo",
          },
          erd: {
            useDefaultIdPk: true,
            autoCreateFk: true,
            suggestAssociativeForNN: true,
            showFieldTypes: true,
            enableDataSemantics: true,
            generateTimestamps: true,
            suggestIndexes: true,
          },
        },
      },
    },
  );
  expect(createResponse.ok()).toBe(true);
  const createPayload = (await createResponse.json()) as {
    data?: {
      projectId?: string;
      sourceStatus?: { statusCode?: string; statusLabel?: string };
    };
  };
  expect(createPayload.data?.projectId).toBeTruthy();
  expect(createPayload.data?.sourceStatus?.statusCode).toBe("imported");
  expect(createPayload.data?.sourceStatus?.statusLabel).toMatch(/Importada/i);
});
