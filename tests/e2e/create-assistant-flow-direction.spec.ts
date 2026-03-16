import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

type CreateAssistantResponse = {
  data?: {
    projectId?: string;
  };
};

type WorkingSnapshotResponse = {
  data?: {
    workingSnapshot?: {
      snapshot: {
        nodes: Array<{
          id: string;
          position: { x: number; y: number };
          data?: { role?: string };
        }>;
        edges: Array<{
          sourceNodeId: string;
          targetNodeId: string;
          kind: string;
        }>;
      };
    };
  };
};

const baseAutomation = {
  inferRelations: true,
  createLinkFields: true,
  applySuggestedNames: true,
  autoOrganizeOnCreate: true,
  detectInconsistenciesEarly: true,
};

async function createFlowProject(input: {
  pageRequest: APIRequestContext;
  layout: "horizontal" | "vertical";
  direction: "left-right" | "top-down";
}) {
  const response = await input.pageRequest.post(
    "/api/projects/create-with-assistant",
    {
      data: {
        projectName: `E2E Flow Direction ${Date.now()}-${Math.floor(Math.random() * 1_000)}`,
        profile: "process",
        startStrategy: "manual",
        initialView: "flow",
        layout: input.layout,
        detailLevel: "intermediate",
        automation: baseAutomation,
        context: {
          setup: {
            createExamples: true,
          },
          flow: {
            autoCreateStartEnd: true,
            allowDecisions: true,
            direction: input.direction,
            allowMultipleOutputs: false,
          },
        },
      },
    },
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `create-with-assistant failed (${response.status()}): ${body}`,
    );
  }
  const payload = (await response.json()) as CreateAssistantResponse;
  const projectId = payload.data?.projectId;
  expect(projectId).toBeTruthy();
  return projectId!;
}

async function getWorkingSnapshot(input: {
  pageRequest: APIRequestContext;
  projectId: string;
}) {
  const response = await input.pageRequest.get(
    `/api/projects/${input.projectId}/working-snapshot`,
  );
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as WorkingSnapshotResponse;
  const snapshot = payload.data?.workingSnapshot?.snapshot;
  expect(snapshot).toBeTruthy();
  return snapshot!;
}

function assertFlowDirection(input: {
  snapshot: Awaited<ReturnType<typeof getWorkingSnapshot>>;
  orientation: "horizontal" | "vertical";
}) {
  const nodeById = new Map(
    input.snapshot.nodes.map((node) => [node.id, node] as const),
  );

  const startNode = input.snapshot.nodes.find(
    (node) => node.data?.role === "flow-start",
  );
  const endNode = input.snapshot.nodes.find(
    (node) => node.data?.role === "flow-end",
  );
  expect(startNode).toBeTruthy();
  expect(endNode).toBeTruthy();

  const flowEdges = input.snapshot.edges.filter((edge) => edge.kind === "flows-to");
  expect(flowEdges.length).toBeGreaterThan(0);

  if (input.orientation === "horizontal") {
    expect(endNode!.position.x).toBeGreaterThan(startNode!.position.x);
    expect(
      Math.abs(endNode!.position.x - startNode!.position.x),
    ).toBeGreaterThan(Math.abs(endNode!.position.y - startNode!.position.y));

    for (const edge of flowEdges) {
      const source = nodeById.get(edge.sourceNodeId);
      const target = nodeById.get(edge.targetNodeId);
      if (!source || !target) {
        continue;
      }
      expect(target.position.x).toBeGreaterThanOrEqual(source.position.x);
    }
    return;
  }

  expect(endNode!.position.y).toBeGreaterThan(startNode!.position.y);
  expect(
    Math.abs(endNode!.position.y - startNode!.position.y),
  ).toBeGreaterThan(Math.abs(endNode!.position.x - startNode!.position.x));

  for (const edge of flowEdges) {
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);
    if (!source || !target) {
      continue;
    }
    expect(target.position.y).toBeGreaterThanOrEqual(source.position.y);
  }
}

test("Assistente aplica direcao real no mapa inicial de Flow (horizontal vs vertical)", async ({
  authenticatedPage,
}) => {
  const horizontalProjectId = await createFlowProject({
    pageRequest: authenticatedPage.request,
    layout: "horizontal",
    direction: "left-right",
  });
  const verticalProjectId = await createFlowProject({
    pageRequest: authenticatedPage.request,
    layout: "vertical",
    direction: "top-down",
  });

  const horizontalSnapshot = await getWorkingSnapshot({
    pageRequest: authenticatedPage.request,
    projectId: horizontalProjectId,
  });
  const verticalSnapshot = await getWorkingSnapshot({
    pageRequest: authenticatedPage.request,
    projectId: verticalProjectId,
  });

  assertFlowDirection({
    snapshot: horizontalSnapshot,
    orientation: "horizontal",
  });
  assertFlowDirection({
    snapshot: verticalSnapshot,
    orientation: "vertical",
  });
});
