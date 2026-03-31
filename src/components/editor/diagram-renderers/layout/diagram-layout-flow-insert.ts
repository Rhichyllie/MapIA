import type { DiagramLayoutNode } from "./diagram-layout";
import {
  FLOW_INSERT_LAYOUT,
  readFlowInsertNodeDescriptor,
  resolveBalancedFlowLane,
  resolveFlowDirection,
  resolveFlowInsertMode,
  resolveFlowLogicalFootprint,
  resolveFlowNodeVariant,
  resolveFlowVariantFromInsertMode,
  type FlowDirection,
  type FlowInsertMode,
  type FlowLogicalPosition,
} from "./diagram-layout-flow-types";
import {
  alignFlowSecondaryStarts,
  fromFlowLogicalPosition,
  isFlowLogicalSlotFree,
  toFlowLogicalPosition,
} from "./diagram-layout-flow-geometry";

function resolveFlowInsertionSlot(input: {
  anchorNode: DiagramLayoutNode;
  nodes: DiagramLayoutNode[];
  direction: FlowDirection;
  insertMode: FlowInsertMode;
  insertNode?: Pick<DiagramLayoutNode, "kind" | "diagramRole"> | null;
}) {
  const anchorLogicalPosition = toFlowLogicalPosition(
    input.anchorNode.position,
    input.direction,
  );
  const anchorFootprint = resolveFlowLogicalFootprint({
    direction: input.direction,
    node: input.anchorNode,
  });
  const targetVariant = input.insertNode
    ? resolveFlowNodeVariant(input.insertNode)
    : resolveFlowVariantFromInsertMode(input.insertMode);
  const targetFootprint = resolveFlowLogicalFootprint({
    direction: input.direction,
    variant: targetVariant,
  });
  const candidates: FlowLogicalPosition[] = [];

  if (input.insertMode === "flow-branch") {
    const basePrimary =
      anchorLogicalPosition.primary +
      Math.max(
        anchorFootprint.primarySpan * 0.68,
        FLOW_INSERT_LAYOUT.branchForwardOffset + anchorFootprint.primarySpan * 0.4,
      );
    const baseSecondary = alignFlowSecondaryStarts({
      anchorPosition: anchorLogicalPosition,
      anchorFootprint,
      targetFootprint,
    });
    const columnStep =
      Math.max(targetFootprint.primarySpan * 0.72, FLOW_INSERT_LAYOUT.branchColumnGap);
    const initialOffset =
      Math.max(anchorFootprint.secondarySpan, targetFootprint.secondarySpan) / 2 +
      FLOW_INSERT_LAYOUT.branchSecondaryGap;
    const laneStep = targetFootprint.secondarySpan + FLOW_INSERT_LAYOUT.branchLaneGap;

    for (let lane = 0; lane < 4; lane += 1) {
      const laneValue = resolveBalancedFlowLane(lane);
      const secondaryOffset =
        Math.sign(laneValue) *
        (initialOffset + (Math.abs(laneValue) - 1) * laneStep);

      for (let column = 0; column < 3; column += 1) {
        candidates.push({
          primary: basePrimary + column * columnStep,
          secondary: baseSecondary + secondaryOffset,
        });
      }
    }
  } else if (input.insertMode === "flow-note") {
    const basePrimary =
      anchorLogicalPosition.primary +
      Math.max((anchorFootprint.primarySpan - targetFootprint.primarySpan) / 2, 0) +
      FLOW_INSERT_LAYOUT.noteForwardOffset;
    const baseSecondary =
      anchorLogicalPosition.secondary -
      targetFootprint.secondarySpan -
      FLOW_INSERT_LAYOUT.noteSecondaryGap;
    const clusterStep =
      Math.max(targetFootprint.primarySpan * 0.62, FLOW_INSERT_LAYOUT.noteClusterGap);
    const bandStep = targetFootprint.secondarySpan + FLOW_INSERT_LAYOUT.noteLaneGap;

    for (let band = 0; band < 4; band += 1) {
      for (let column = 0; column < 3; column += 1) {
        candidates.push({
          primary: basePrimary + column * clusterStep,
          secondary: baseSecondary - band * bandStep,
        });
      }
    }
  } else {
    const basePrimary =
      anchorLogicalPosition.primary +
      anchorFootprint.primarySpan +
      FLOW_INSERT_LAYOUT.trunkPrimaryGap;
    const baseSecondary = alignFlowSecondaryStarts({
      anchorPosition: anchorLogicalPosition,
      anchorFootprint,
      targetFootprint,
    });
    const primaryStep =
      targetFootprint.primarySpan + FLOW_INSERT_LAYOUT.trunkPrimaryGap;
    const bandStep =
      targetFootprint.secondarySpan + FLOW_INSERT_LAYOUT.trunkSecondaryGap;

    for (let column = 0; column < 5; column += 1) {
      candidates.push({
        primary: basePrimary + column * primaryStep,
        secondary: baseSecondary,
      });
    }

    for (let band = 1; band <= 2; band += 1) {
      candidates.push({
        primary: basePrimary,
        secondary: baseSecondary + band * bandStep,
      });
      candidates.push({
        primary: basePrimary,
        secondary: baseSecondary - band * bandStep,
      });
    }
  }

  const firstFreeCandidate = candidates.find((candidate) =>
    isFlowLogicalSlotFree({
      candidate,
      candidateFootprint: targetFootprint,
      nodes: input.nodes,
      direction: input.direction,
    }),
  );

  const fallbackCandidate =
    firstFreeCandidate ??
    candidates[0] ?? {
      primary:
        anchorLogicalPosition.primary +
        anchorFootprint.primarySpan +
        FLOW_INSERT_LAYOUT.trunkPrimaryGap,
      secondary: alignFlowSecondaryStarts({
        anchorPosition: anchorLogicalPosition,
        anchorFootprint,
        targetFootprint,
      }),
    };

  return fromFlowLogicalPosition(fallbackCandidate, input.direction);
}

export function computeFlowInsertPosition(input: {
  anchorNode: DiagramLayoutNode;
  nodes: DiagramLayoutNode[];
  layoutOptions?: unknown;
}) {
  const direction = resolveFlowDirection(input.layoutOptions);
  return resolveFlowInsertionSlot({
    anchorNode: input.anchorNode,
    nodes: input.nodes,
    direction,
    insertMode: resolveFlowInsertMode(input.layoutOptions),
    insertNode: readFlowInsertNodeDescriptor(input.layoutOptions),
  });
}
