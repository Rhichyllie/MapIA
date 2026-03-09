import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEditorCommandRemotely } from "./editor-command-service";

describe("editor-command-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends single command payload to editor-commands endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            workingSnapshot: {
              revision: 2,
              snapshot: {
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 },
              },
            },
            newRevision: 2,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await applyEditorCommandRemotely(
      "58f3ca26-085e-4237-80d9-adcc42f7142b",
      {
        type: "removeEdge",
        edgeId: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
      },
      {
        expectedRevision: 1,
        semanticMode: "operational",
      },
    );

    expect(result.newRevision).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe(
      "/api/projects/58f3ca26-085e-4237-80d9-adcc42f7142b/editor-commands",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(init?.body).toBe(
      JSON.stringify({
        command: {
          type: "removeEdge",
          edgeId: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
        },
        expectedRevision: 1,
        semanticMode: "operational",
      }),
    );
  });

  it("returns friendly api error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "GRAPH_DUPLICATE_EDGE_RELATION",
          message: "Edge duplicada (source + target + kind) nao e permitida.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      applyEditorCommandRemotely("58f3ca26-085e-4237-80d9-adcc42f7142b", {
        type: "removeEdge",
        edgeId: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
      }),
    ).rejects.toThrow(/Edge duplicada/i);
  });
});
