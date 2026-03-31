import { describe, expect, it } from "vitest";
import { formatEditorTemplate, type EditorTranslationFn } from "../editor-i18n";
import { loadMessages } from "@/src/i18n/messages";
import { resolveFlowNodePresentation } from "./flow-presentation";

function createEditorTranslator(messages: Awaited<ReturnType<typeof loadMessages>>): EditorTranslationFn {
  return (key, values) => {
    const value = `Editor.${key}`.split(".").reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, messages);

    return typeof value === "string"
      ? formatEditorTemplate(value, values)
      : key;
  };
}

describe("flow presentation", () => {
  it("uses localized process role copy when a translator is provided", async () => {
    const messages = await loadMessages("en-US");
    const t = createEditorTranslator(messages);

    const presentation = resolveFlowNodePresentation({
      diagramRole: "flow-start",
      kind: "flow-step",
      label: "Review request",
      t,
    });

    expect(presentation.variant).toBe("flow-start");
    expect(presentation.eyebrowLabel).toBe("Start");
    expect(presentation.roleLabel).toBe("Process start");
    expect(presentation.notation).toBe("start-event");
    expect(presentation.summary).toBe(
      "Triggers the process and frames the first pass.",
    );
  });
});
