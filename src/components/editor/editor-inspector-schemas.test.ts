import { describe, expect, it } from "vitest";
import {
  buildUpdateEdgeCommandFromInspectorForm,
  buildUpdateNodeCommandFromInspectorForm,
  formatInspectorJson,
} from "./editor-inspector-schemas";

describe("editor-inspector-schemas", () => {
  it("builds updateNode command from valid form input", () => {
    const command = buildUpdateNodeCommandFromInspectorForm({
      nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
      label: "  User  ",
      kind: "entity",
      dataJson: '{ "owner": true }',
    });

    expect(command).toEqual({
      type: "updateNode",
      nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
      patch: {
        label: "User",
        kind: "entity",
        data: { owner: true },
      },
    });
  });

  it("builds updateEdge command and allows empty label", () => {
    const command = buildUpdateEdgeCommandFromInspectorForm({
      edgeId: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
      label: "   ",
      kind: "flows-to",
      dataJson: "",
    });

    expect(command).toEqual({
      type: "updateEdge",
      edgeId: "0dc56b95-fd65-48b7-bb8d-7402c0dd92e2",
      patch: {
        label: "",
        kind: "flows-to",
        data: {},
      },
    });
  });

  it("rejects invalid json in inspector form", () => {
    expect(() =>
      buildUpdateNodeCommandFromInspectorForm({
        nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
        label: "Node",
        kind: "note",
        dataJson: "{ invalid }",
      }),
    ).toThrow(/JSON invalido/i);
  });

  it("keeps JSON error humanized (with line/column when available)", () => {
    const run = () =>
      buildUpdateNodeCommandFromInspectorForm({
        nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
        label: "Node",
        kind: "note",
        dataJson: '{\n  "valid": true,\n  "broken":\n}',
      });

    expect(run).toThrow(/JSON invalido/i);
  });

  it("formats json for textarea", () => {
    expect(formatInspectorJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatInspectorJson(undefined)).toBe("{}");
  });
});
