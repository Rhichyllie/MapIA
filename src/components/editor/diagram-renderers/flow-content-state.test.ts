import { describe, expect, it } from "vitest";
import { formatEditorTemplate, type EditorTranslationFn } from "../editor-i18n";
import { loadMessages } from "@/src/i18n/messages";
import {
  FLOW_NODE_CONTENT_POLICIES,
  getFlowNodeReservedFootprint,
} from "./flow-content-policy";
import {
  formatFlowEdgeCanvasLabel,
  resolveFlowNodeContentState,
} from "./flow-content-state";
import { resolveFlowNodePresentation } from "./flow-presentation";

function createEditorTranslator(
  messages: Awaited<ReturnType<typeof loadMessages>>,
): EditorTranslationFn {
  return (key, values) => {
    const value = `Editor.${key}`
      .split(".")
      .reduce<unknown>((current, segment) => {
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

describe("flow content state", () => {
  it("defines explicit content policies for each process shape", () => {
    expect(Object.keys(FLOW_NODE_CONTENT_POLICIES)).toEqual([
      "flow-start",
      "flow-step",
      "flow-decision",
      "flow-end",
      "flow-note",
    ]);

    expect(FLOW_NODE_CONTENT_POLICIES["flow-start"].summary.placement).toBe(
      "internal",
    );
    expect(FLOW_NODE_CONTENT_POLICIES["flow-step"].summary.lines).toBe(4);
    expect(
      FLOW_NODE_CONTENT_POLICIES["flow-decision"].contentAllowance.internal,
    ).toEqual(["title"]);
    expect(FLOW_NODE_CONTENT_POLICIES["flow-decision"].caption.enabled).toBe(
      true,
    );
    expect(FLOW_NODE_CONTENT_POLICIES["flow-end"].meta.lines).toBe(1);
    expect(FLOW_NODE_CONTENT_POLICIES["flow-note"].width.max).toBe(336);
  });

  it("derives dense step state from payload description and operational context", async () => {
    const messages = await loadMessages("en-US");
    const t = createEditorTranslator(messages);
    const flowPresentation = resolveFlowNodePresentation({
      diagramRole: "flow-step",
      kind: "flow-step",
      label: "Consolidate compliance evidence before approval",
      t,
    });

    const state = resolveFlowNodeContentState({
      nodeData: {
        payload: {
          description:
            "Collects attachments, sanitizes sensitive fields, and prepares a single operational package for the final review.",
          __mapia: {
            process: {
              owner: "Compliance Ops",
              area: "Credit",
              channel: "B2B Portal",
              sla: "4h",
            },
          },
        },
      },
      displayLabel: "Consolidate compliance evidence before approval",
      flowPresentation,
      t,
    });

    expect(state.density).toBe("rich");
    expect(state.summarySource).toBe("payload-description");
    expect(state.metaSource).toBe("operational");
    expect(state.metaText).toContain("Compliance Ops");
    expect(state.metaText).toContain("Credit");
    expect(state.cssVariables["--flow-node-frame-width"]).toBe("368px");
    expect(state.cssVariables["--flow-node-frame-height"]).toBe("236px");
  });

  it("keeps gateway content minimal internally and reserves caption space externally", async () => {
    const messages = await loadMessages("en-US");
    const t = createEditorTranslator(messages);
    const flowPresentation = resolveFlowNodePresentation({
      diagramRole: "flow-decision",
      kind: "flow-step",
      label: "Need a manual fraud review before approval?",
      t,
    });

    const state = resolveFlowNodeContentState({
      nodeData: {
        payload: {
          __mapia: {
            process: {
              rule: "Checks threshold breaches and opens a manual branch when there is enough risk evidence.",
              owner: "Fraud Ops",
            },
          },
        },
      },
      displayLabel: "Need a manual fraud review before approval?",
      flowPresentation,
      t,
    });

    expect(state.summarySource).toBe("process-rule");
    expect(state.policy.contentAllowance.internal).toEqual(["title"]);
    expect(state.policy.contentAllowance.external).toContain("summary");
    expect(state.cssVariables["--flow-node-caption-width"]).toBe("248px");
    expect(getFlowNodeReservedFootprint("flow-decision").height).toBe(420);
    expect(state.tooltipText).toContain("manual fraud review");
  });

  it("truncates long flow edge labels for canvas readability", () => {
    expect(formatFlowEdgeCanvasLabel("Yes")).toBe("Yes");
    expect(
      formatFlowEdgeCanvasLabel(
        "Aprovacao condicionada por documentacao complementar obrigatoria",
      ),
    ).toBe("Aprovacao condicionada por…");
  });
});
