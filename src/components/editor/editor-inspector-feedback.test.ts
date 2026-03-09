import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { buildUpdateNodeCommandFromInspectorForm } from "./editor-inspector-schemas";
import { getFriendlyInspectorFeedback } from "./editor-inspector-feedback";

function captureThrownError(fn: () => void) {
  try {
    fn();
    throw new Error("Expected function to throw");
  } catch (error) {
    return error;
  }
}

describe("editor-inspector-feedback", () => {
  it("returns friendly message for invalid JSON and maps field error", () => {
    const error = captureThrownError(() =>
      buildUpdateNodeCommandFromInspectorForm({
        nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
        label: "Node",
        kind: "note",
        dataJson: "{ invalid }",
      }),
    );

    const feedback = getFriendlyInspectorFeedback(error);

    expect(feedback.fieldErrors.dataJson).toMatch(/JSON invalido/i);
    expect(feedback.message).toMatch(/JSON invalido/i);
  });

  it("returns friendly message for invalid kind", () => {
    const error = captureThrownError(() =>
      buildUpdateNodeCommandFromInspectorForm({
        nodeId: "8f0f4805-5f98-471c-a074-67c196419b15",
        label: "Node",
        kind: "invalid-kind" as never,
        dataJson: "{}",
      }),
    );

    const feedback = getFriendlyInspectorFeedback(error);

    expect(feedback.fieldErrors.kind).toBe("Tipo invalido.");
    expect(feedback.message).toBe("Tipo invalido.");
  });

  it("returns fallback for unexpected errors", () => {
    const feedback = getFriendlyInspectorFeedback(new Error('[{"message":"raw"}]'));

    expect(feedback.fieldErrors).toEqual({});
    expect(feedback.message).toBe("Nao foi possivel validar o formulario.");
  });

  it("keeps compatibility with root-level JSON Zod issues", () => {
    const error = new ZodError([
      {
        code: "custom",
        message: "JSON invalido.",
        path: [],
      },
    ]);

    const feedback = getFriendlyInspectorFeedback(error);

    expect(feedback.fieldErrors.dataJson).toBe(
      "JSON invalido. Verifique chaves, virgulas e aspas.",
    );
  });
});
