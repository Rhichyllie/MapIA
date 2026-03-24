import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function clickPrimaryStepAction(page: Page) {
  await page.locator("nav.step-nav .btn-primary").click();
}

test("UI mostra status honesto para DB configuravel: pronta para tentar importar", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/create");
  await expect(
    authenticatedPage.getByTestId("creation-assistant-shell"),
  ).toBeVisible();

  await authenticatedPage.locator("#assistant-project-name").fill("E2E Source Status DB");
  await clickPrimaryStepAction(authenticatedPage);
  await authenticatedPage
    .getByRole("button", { name: /Modelo de dados|Data model/i })
    .first()
    .click();
  await clickPrimaryStepAction(authenticatedPage);

  await authenticatedPage
    .getByRole("button", { name: /Importar do sistema|Import from system/i })
    .first()
    .click();

  await authenticatedPage
    .locator("#origin-db-connection-string")
    .fill("postgresql://reader:secret@db.internal:5432/mapia");

  await expect(
    authenticatedPage.locator(".badge", {
      hasText: /Pronta para tentar importar|Ready to attempt import/i,
    }),
  ).toBeVisible();
  await expect(
    authenticatedPage.getByText(/Importada com sucesso|Imported successfully/i),
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
      sourceStatus?: { statusCode?: string };
    };
  };
  expect(createPayload.data?.projectId).toBeTruthy();
  expect(createPayload.data?.sourceStatus?.statusCode).toBe("imported");
});

test("preview de fonte no locale alternativo resolve copy pelo catalogo oficial", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/en-US/create");
  await expect(
    authenticatedPage.getByTestId("creation-assistant-shell"),
  ).toBeVisible();

  await authenticatedPage.locator("#assistant-project-name").fill("E2E EN Preview");
  await clickPrimaryStepAction(authenticatedPage);
  await authenticatedPage
    .getByRole("button", { name: /Arquitetura do sistema|System architecture/i })
    .first()
    .click();
  await clickPrimaryStepAction(authenticatedPage);

  await authenticatedPage
    .getByRole("button", { name: /Importar do sistema|Import from system/i })
    .first()
    .click();
  await authenticatedPage.getByRole("button", { name: /OpenAPI/i }).first().click();
  await authenticatedPage.locator("#origin-openapi-mode").selectOption("paste");
  await authenticatedPage
    .locator("#origin-openapi-text")
    .fill('{"info":{"title":"API without marker"},"paths":{}}');

  await expect(
    authenticatedPage.getByText(
      "Document missing an openapi or swagger field.",
      { exact: true },
    ),
  ).toBeVisible();
});
