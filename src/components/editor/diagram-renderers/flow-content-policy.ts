import type { ProcessNodeRole } from "@/src/modules/diagrams/domain";

export type FlowContentDensity = "compact" | "balanced" | "rich";

export type FlowContentPlacement = "internal" | "external" | "hidden";

export type FlowNodeContentPolicy = {
  role: ProcessNodeRole;
  notation: "start-event" | "activity" | "gateway" | "end-event" | "artifact";
  width: {
    min: number;
    ideal: number;
    max: number;
  };
  height: {
    min: number;
    max: number;
  };
  densitySizing: Record<
    FlowContentDensity,
    {
      width: number;
      minHeight: number;
      captionWidth?: number;
    }
  >;
  layoutFootprint: {
    width: number;
    height: number;
    paddingPrimary: number;
    paddingSecondary: number;
  };
  padding: {
    blockStartRem: number;
    blockEndRem: number;
    inlineStartRem: number;
    inlineEndRem: number;
  };
  title: {
    lines: number;
    maxWidthCh: number;
    strategy: "wrap" | "balance";
  };
  summary: {
    placement: FlowContentPlacement;
    lines: number;
    maxWidthCh: number;
  };
  meta: {
    placement: FlowContentPlacement;
    lines: number;
    maxWidthCh: number;
  };
  caption: {
    enabled: boolean;
    gapRem: number;
    summaryLines: number;
    summaryMaxWidthCh: number;
    metaLines: number;
    metaMaxWidthCh: number;
  };
  contentAllowance: {
    internal: Array<"title" | "summary" | "meta" | "role" | "technical">;
    external: Array<"title" | "summary" | "meta" | "role" | "technical">;
  };
  densityThresholds: {
    balanced: number;
    rich: number;
  };
};

export type FlowReservedFootprint = FlowNodeContentPolicy["layoutFootprint"];

export const FLOW_NODE_CONTENT_POLICIES: Record<
  ProcessNodeRole,
  FlowNodeContentPolicy
> = {
  "flow-start": {
    role: "flow-start",
    notation: "start-event",
    width: {
      min: 280,
      ideal: 304,
      max: 324,
    },
    height: {
      min: 160,
      max: 196,
    },
    densitySizing: {
      compact: {
        width: 284,
        minHeight: 166,
      },
      balanced: {
        width: 304,
        minHeight: 182,
      },
      rich: {
        width: 324,
        minHeight: 194,
      },
    },
    layoutFootprint: {
      width: 332,
      height: 208,
      paddingPrimary: 110,
      paddingSecondary: 108,
    },
    padding: {
      blockStartRem: 0.98,
      blockEndRem: 1,
      inlineStartRem: 1.2,
      inlineEndRem: 1.18,
    },
    title: {
      lines: 2,
      maxWidthCh: 16,
      strategy: "balance",
    },
    summary: {
      placement: "internal",
      lines: 2,
      maxWidthCh: 18,
    },
    meta: {
      placement: "internal",
      lines: 1,
      maxWidthCh: 18,
    },
    caption: {
      enabled: false,
      gapRem: 0,
      summaryLines: 0,
      summaryMaxWidthCh: 0,
      metaLines: 0,
      metaMaxWidthCh: 0,
    },
    contentAllowance: {
      internal: ["title", "summary", "meta", "role", "technical"],
      external: [],
    },
    densityThresholds: {
      balanced: 44,
      rich: 82,
    },
  },
  "flow-step": {
    role: "flow-step",
    notation: "activity",
    width: {
      min: 300,
      ideal: 336,
      max: 368,
    },
    height: {
      min: 178,
      max: 238,
    },
    densitySizing: {
      compact: {
        width: 308,
        minHeight: 188,
      },
      balanced: {
        width: 336,
        minHeight: 214,
      },
      rich: {
        width: 368,
        minHeight: 236,
      },
    },
    layoutFootprint: {
      width: 372,
      height: 248,
      paddingPrimary: 96,
      paddingSecondary: 104,
    },
    padding: {
      blockStartRem: 1.12,
      blockEndRem: 1.1,
      inlineStartRem: 1.24,
      inlineEndRem: 1.24,
    },
    title: {
      lines: 3,
      maxWidthCh: 21,
      strategy: "wrap",
    },
    summary: {
      placement: "internal",
      lines: 4,
      maxWidthCh: 30,
    },
    meta: {
      placement: "internal",
      lines: 2,
      maxWidthCh: 29,
    },
    caption: {
      enabled: false,
      gapRem: 0,
      summaryLines: 0,
      summaryMaxWidthCh: 0,
      metaLines: 0,
      metaMaxWidthCh: 0,
    },
    contentAllowance: {
      internal: ["title", "summary", "meta", "role", "technical"],
      external: [],
    },
    densityThresholds: {
      balanced: 58,
      rich: 108,
    },
  },
  "flow-decision": {
    role: "flow-decision",
    notation: "gateway",
    width: {
      min: 286,
      ideal: 302,
      max: 318,
    },
    height: {
      min: 286,
      max: 318,
    },
    densitySizing: {
      compact: {
        width: 286,
        minHeight: 286,
        captionWidth: 216,
      },
      balanced: {
        width: 302,
        minHeight: 302,
        captionWidth: 232,
      },
      rich: {
        width: 318,
        minHeight: 318,
        captionWidth: 248,
      },
    },
    layoutFootprint: {
      width: 318,
      height: 420,
      paddingPrimary: 138,
      paddingSecondary: 236,
    },
    padding: {
      blockStartRem: 0,
      blockEndRem: 0,
      inlineStartRem: 0,
      inlineEndRem: 0,
    },
    title: {
      lines: 3,
      maxWidthCh: 11,
      strategy: "balance",
    },
    summary: {
      placement: "external",
      lines: 3,
      maxWidthCh: 22,
    },
    meta: {
      placement: "external",
      lines: 1,
      maxWidthCh: 20,
    },
    caption: {
      enabled: true,
      gapRem: 1,
      summaryLines: 3,
      summaryMaxWidthCh: 22,
      metaLines: 1,
      metaMaxWidthCh: 20,
    },
    contentAllowance: {
      internal: ["title"],
      external: ["summary", "meta", "role", "technical"],
    },
    densityThresholds: {
      balanced: 28,
      rich: 52,
    },
  },
  "flow-end": {
    role: "flow-end",
    notation: "end-event",
    width: {
      min: 286,
      ideal: 308,
      max: 324,
    },
    height: {
      min: 162,
      max: 198,
    },
    densitySizing: {
      compact: {
        width: 292,
        minHeight: 170,
      },
      balanced: {
        width: 308,
        minHeight: 184,
      },
      rich: {
        width: 324,
        minHeight: 196,
      },
    },
    layoutFootprint: {
      width: 332,
      height: 210,
      paddingPrimary: 118,
      paddingSecondary: 112,
    },
    padding: {
      blockStartRem: 1,
      blockEndRem: 1.02,
      inlineStartRem: 1.18,
      inlineEndRem: 1.24,
    },
    title: {
      lines: 2,
      maxWidthCh: 16,
      strategy: "balance",
    },
    summary: {
      placement: "internal",
      lines: 2,
      maxWidthCh: 18,
    },
    meta: {
      placement: "internal",
      lines: 1,
      maxWidthCh: 18,
    },
    caption: {
      enabled: false,
      gapRem: 0,
      summaryLines: 0,
      summaryMaxWidthCh: 0,
      metaLines: 0,
      metaMaxWidthCh: 0,
    },
    contentAllowance: {
      internal: ["title", "summary", "meta", "role", "technical"],
      external: [],
    },
    densityThresholds: {
      balanced: 44,
      rich: 84,
    },
  },
  "flow-note": {
    role: "flow-note",
    notation: "artifact",
    width: {
      min: 286,
      ideal: 312,
      max: 336,
    },
    height: {
      min: 164,
      max: 214,
    },
    densitySizing: {
      compact: {
        width: 292,
        minHeight: 170,
      },
      balanced: {
        width: 312,
        minHeight: 194,
      },
      rich: {
        width: 336,
        minHeight: 214,
      },
    },
    layoutFootprint: {
      width: 340,
      height: 218,
      paddingPrimary: 98,
      paddingSecondary: 118,
    },
    padding: {
      blockStartRem: 1.04,
      blockEndRem: 1.04,
      inlineStartRem: 1.12,
      inlineEndRem: 1.12,
    },
    title: {
      lines: 3,
      maxWidthCh: 21,
      strategy: "wrap",
    },
    summary: {
      placement: "internal",
      lines: 4,
      maxWidthCh: 28,
    },
    meta: {
      placement: "internal",
      lines: 2,
      maxWidthCh: 28,
    },
    caption: {
      enabled: false,
      gapRem: 0,
      summaryLines: 0,
      summaryMaxWidthCh: 0,
      metaLines: 0,
      metaMaxWidthCh: 0,
    },
    contentAllowance: {
      internal: ["title", "summary", "meta", "role", "technical"],
      external: [],
    },
    densityThresholds: {
      balanced: 56,
      rich: 104,
    },
  },
};

export function getFlowNodeContentPolicy(role: ProcessNodeRole) {
  return FLOW_NODE_CONTENT_POLICIES[role];
}

export function getFlowNodeReservedFootprint(
  role: ProcessNodeRole,
): FlowReservedFootprint {
  return getFlowNodeContentPolicy(role).layoutFootprint;
}
