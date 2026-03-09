import { describe, expect, it } from "vitest";
import { EditorSnapshotVersionSchema } from "./snapshot-version";

describe("EditorSnapshotVersionSchema", () => {
  it("accepts immutable snapshot version payload", () => {
    const parsed = EditorSnapshotVersionSchema.parse({
      id: "7bfae9c4-5f93-4f8d-b0dc-7af18e2a7441",
      projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
      label: "Checkpoint manual",
      origin: "manual",
      createdAt: new Date("2026-02-23T21:00:00.000Z"),
      snapshot: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    expect(parsed.origin).toBe("manual");
    expect(parsed.snapshot.viewport.zoom).toBe(1);
  });

  it("rejects invalid origin", () => {
    expect(() =>
      EditorSnapshotVersionSchema.parse({
        id: "7bfae9c4-5f93-4f8d-b0dc-7af18e2a7441",
        projectId: "58f3ca26-085e-4237-80d9-adcc42f7142b",
        origin: "autosave",
        createdAt: new Date("2026-02-23T21:00:00.000Z"),
        snapshot: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
    ).toThrow();
  });
});
