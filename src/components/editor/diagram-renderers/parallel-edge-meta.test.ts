import { describe, expect, it } from "vitest";
import type { EdgeKind } from "@/src/domain";
import type { RFEdge } from "../editor-graph-mappers";
import { computeParallelEdgeMeta } from "./parallel-edge-meta";

function createEdge(
  id: string,
  source: string,
  target: string,
  kind: EdgeKind,
): RFEdge {
  return {
    id,
    source,
    target,
    data: {
      kind,
      payload: {},
      externalRefs: [],
    },
  };
}

describe("computeParallelEdgeMeta", () => {
  it("define índice e total por grupo source->target", () => {
    const edges: RFEdge[] = [
      createEdge("b-edge", "node-a", "node-b", "references"),
      createEdge("a-edge", "node-a", "node-b", "contains"),
      createEdge("single-edge", "node-b", "node-c", "flows-to"),
    ];

    const enriched = computeParallelEdgeMeta(edges);

    expect(enriched).toHaveLength(3);
    expect(enriched[0].data?.parallelTotal).toBe(2);
    expect(enriched[1].data?.parallelTotal).toBe(2);
    expect(enriched[0].data?.parallelIndex).toBe(1);
    expect(enriched[1].data?.parallelIndex).toBe(0);
    expect(enriched[2].data?.parallelTotal).toBe(1);
    expect(enriched[2].data?.parallelIndex).toBe(0);
  });
});
