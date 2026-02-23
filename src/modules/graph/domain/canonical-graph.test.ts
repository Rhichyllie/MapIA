import { describe, expect, it } from "vitest";
import { GraphSnapshotSchema } from "@/src/domain/canonical-graph";

describe("GraphSnapshotSchema", () => {
  it("accepts a minimal canonical graph snapshot", () => {
    const snapshot = GraphSnapshotSchema.parse({
      nodes: [
        {
          id: "8f0f4805-5f98-471c-a074-67c196419b15",
          projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
          kind: "entity",
          label: "User",
          position: { x: 10, y: 20 },
          data: {},
          externalRefs: [],
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1.25 },
    });

    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.viewport.zoom).toBe(1.25);
  });
});
