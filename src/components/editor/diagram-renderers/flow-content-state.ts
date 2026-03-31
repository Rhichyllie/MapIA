import {
  readProcessOperationalContextFromPayload,
  type ProcessNodeRole,
} from "@/src/modules/diagrams/domain";
import type { EditorNodeData } from "../editor-graph-mappers";
import { translateEditor, type EditorTranslationFn } from "../editor-i18n";
import type { FlowNodePresentation } from "./flow-presentation";
import {
  getFlowNodeContentPolicy,
  type FlowContentDensity,
  type FlowNodeContentPolicy,
} from "./flow-content-policy";

export type FlowSummarySource =
  | "semantic"
  | "payload-description"
  | "process-rule"
  | "process-exception";

export type FlowMetaSource = "none" | "operational" | "tags";

export type FlowNodeContentState = {
  policy: FlowNodeContentPolicy;
  density: FlowContentDensity;
  summaryText?: string;
  summarySource: FlowSummarySource;
  metaText?: string;
  metaSource: FlowMetaSource;
  tooltipText: string;
  cssVariables: Record<string, string>;
};

function trimOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function readPayloadDescription(payload: Record<string, unknown>) {
  return trimOptionalText(payload.description);
}

function readPayloadTags(payload: Record<string, unknown>) {
  const rawTags = payload.tags;
  if (!Array.isArray(rawTags)) {
    return [] as string[];
  }

  return rawTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeComparableText(value: string | undefined) {
  return value
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dedupeSummaryCandidates(
  candidates: Array<{ value: string | undefined; source: FlowSummarySource }>,
) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const normalized = normalizeComparableText(candidate.value);
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function resolveSummaryCandidate(
  role: ProcessNodeRole,
  payload: Record<string, unknown>,
  fallbackSummary: string,
): {
  text: string;
  source: FlowSummarySource;
} {
  const description = readPayloadDescription(payload);
  const processContext = readProcessOperationalContextFromPayload(payload);

  const candidates =
    role === "flow-decision"
      ? dedupeSummaryCandidates([
          { value: description, source: "payload-description" },
          { value: processContext.rule, source: "process-rule" },
          { value: processContext.exception, source: "process-exception" },
          { value: fallbackSummary, source: "semantic" },
        ])
      : role === "flow-note"
        ? dedupeSummaryCandidates([
            { value: description, source: "payload-description" },
            { value: processContext.exception, source: "process-exception" },
            { value: processContext.rule, source: "process-rule" },
            { value: fallbackSummary, source: "semantic" },
          ])
        : dedupeSummaryCandidates([
            { value: description, source: "payload-description" },
            { value: processContext.rule, source: "process-rule" },
            { value: processContext.exception, source: "process-exception" },
            { value: fallbackSummary, source: "semantic" },
          ]);

  const first = candidates[0];
  return {
    text: first?.value ?? fallbackSummary,
    source: first?.source ?? "semantic",
  };
}

function resolveCriticalityLabel(
  criticality: "low" | "medium" | "high" | "critical" | undefined,
  t?: EditorTranslationFn,
) {
  if (!criticality) {
    return undefined;
  }

  return translateEditor(
    t,
    `process.operational.summary.criticality.${criticality}`,
  );
}

function resolveMetaSegments(input: {
  role: ProcessNodeRole;
  payload: Record<string, unknown>;
  t?: EditorTranslationFn;
}) {
  const processContext = readProcessOperationalContextFromPayload(
    input.payload,
  );
  const tags = readPayloadTags(input.payload);
  const maxSegments =
    input.role === "flow-note" || input.role === "flow-decision" ? 2 : 3;

  const operationalSegments = [
    processContext.owner,
    processContext.area,
    processContext.channel,
    processContext.sla,
    resolveCriticalityLabel(processContext.criticality, input.t),
  ].filter((segment): segment is string => Boolean(segment));

  const tagSegments = tags.map((tag) => `#${tag}`);

  if (input.role === "flow-note") {
    const noteSegments = [...tagSegments, ...operationalSegments];
    return {
      source:
        tagSegments.length > 0
          ? ("tags" as const)
          : operationalSegments.length > 0
            ? ("operational" as const)
            : ("none" as const),
      segments: noteSegments.slice(0, maxSegments),
    };
  }

  const segments = [...operationalSegments, ...tagSegments];
  return {
    source:
      operationalSegments.length > 0
        ? ("operational" as const)
        : tagSegments.length > 0
          ? ("tags" as const)
          : ("none" as const),
    segments: segments.slice(0, maxSegments),
  };
}

function measureLongestToken(value: string | undefined) {
  if (!value) {
    return 0;
  }

  return value
    .split(/[\s/|,.:;!?()[\]{}-]+/g)
    .reduce((longest, token) => Math.max(longest, token.length), 0);
}

function resolveFlowContentDensity(input: {
  title: string;
  summaryText?: string;
  metaText?: string;
  policy: FlowNodeContentPolicy;
}) {
  const contentLoad =
    input.title.length +
    (input.summaryText ? input.summaryText.length * 0.55 + 14 : 0) +
    (input.metaText ? input.metaText.length * 0.32 + 10 : 0) +
    (measureLongestToken(input.title) > 18 ? 18 : 0) +
    (measureLongestToken(input.summaryText) > 24 ? 16 : 0);

  if (contentLoad >= input.policy.densityThresholds.rich) {
    return "rich" satisfies FlowContentDensity;
  }

  if (contentLoad >= input.policy.densityThresholds.balanced) {
    return "balanced" satisfies FlowContentDensity;
  }

  return "compact" satisfies FlowContentDensity;
}

function buildFlowNodeCssVariables(input: {
  policy: FlowNodeContentPolicy;
  density: FlowContentDensity;
}) {
  const densitySizing = input.policy.densitySizing[input.density];
  const captionWidth =
    densitySizing.captionWidth ??
    input.policy.densitySizing.balanced.captionWidth ??
    input.policy.width.ideal;

  return {
    "--flow-node-frame-width": `${densitySizing.width}px`,
    "--flow-node-frame-width-min": `${input.policy.width.min}px`,
    "--flow-node-frame-width-max": `${input.policy.width.max}px`,
    "--flow-node-frame-height": `${densitySizing.minHeight}px`,
    "--flow-node-frame-height-max": `${input.policy.height.max}px`,
    "--flow-node-padding-block-start": `${input.policy.padding.blockStartRem}rem`,
    "--flow-node-padding-block-end": `${input.policy.padding.blockEndRem}rem`,
    "--flow-node-padding-inline-start": `${input.policy.padding.inlineStartRem}rem`,
    "--flow-node-padding-inline-end": `${input.policy.padding.inlineEndRem}rem`,
    "--flow-node-title-lines": String(input.policy.title.lines),
    "--flow-node-summary-lines": String(input.policy.summary.lines),
    "--flow-node-meta-lines": String(input.policy.meta.lines),
    "--flow-node-caption-width": `${captionWidth}px`,
    "--flow-node-caption-gap": `${input.policy.caption.gapRem}rem`,
    "--flow-node-caption-summary-lines": String(
      input.policy.caption.summaryLines,
    ),
    "--flow-node-caption-summary-max-width": `${input.policy.caption.summaryMaxWidthCh}ch`,
    "--flow-node-caption-meta-lines": String(input.policy.caption.metaLines),
    "--flow-node-caption-meta-max-width": `${input.policy.caption.metaMaxWidthCh}ch`,
    "--flow-node-title-max-width": `${input.policy.title.maxWidthCh}ch`,
    "--flow-node-summary-max-width": `${input.policy.summary.maxWidthCh}ch`,
    "--flow-node-meta-max-width": `${input.policy.meta.maxWidthCh}ch`,
  } satisfies Record<string, string>;
}

export function resolveFlowNodeContentState(input: {
  nodeData: Pick<EditorNodeData, "payload">;
  displayLabel: string;
  flowPresentation: Pick<
    FlowNodePresentation,
    "variant" | "summary" | "notation"
  >;
  t?: EditorTranslationFn;
}): FlowNodeContentState {
  const policy = getFlowNodeContentPolicy(input.flowPresentation.variant);
  const summary = resolveSummaryCandidate(
    input.flowPresentation.variant,
    input.nodeData.payload,
    input.flowPresentation.summary,
  );
  const meta = resolveMetaSegments({
    role: input.flowPresentation.variant,
    payload: input.nodeData.payload,
    t: input.t,
  });
  const metaText =
    meta.segments.length > 0 ? meta.segments.join(" · ") : undefined;
  const density = resolveFlowContentDensity({
    title: input.displayLabel,
    summaryText: summary.text,
    metaText,
    policy,
  });

  return {
    policy,
    density,
    summaryText: summary.text,
    summarySource: summary.source,
    metaText,
    metaSource: meta.source,
    tooltipText: [input.displayLabel, summary.text, metaText]
      .filter(Boolean)
      .join("\n"),
    cssVariables: buildFlowNodeCssVariables({
      policy,
      density,
    }),
  };
}

function truncateAtWordBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, maxLength - 1);
  const lastBreak = Math.max(
    slice.lastIndexOf(" "),
    slice.lastIndexOf("/"),
    slice.lastIndexOf("-"),
  );

  if (lastBreak > maxLength * 0.55) {
    return `${slice.slice(0, lastBreak).trimEnd()}…`;
  }

  return `${slice.trimEnd()}…`;
}

export function formatFlowEdgeCanvasLabel(label: string | undefined) {
  const normalized = label?.trim();
  if (!normalized) {
    return normalized;
  }

  return truncateAtWordBoundary(normalized, 34);
}
