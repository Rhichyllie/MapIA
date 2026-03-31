import type { DiagramLayoutNode } from "./diagram-layout";
import type {
  FlowDirection,
  FlowLogicalBox,
  FlowLogicalFootprint,
  FlowLogicalPosition,
} from "./diagram-layout-flow-types";
import { isFlowNoteNode, resolveFlowLogicalFootprint } from "./diagram-layout-flow-types";

export function roundPosition(position: { x: number; y: number }) {
  return {
    x: Number(position.x.toFixed(2)),
    y: Number(position.y.toFixed(2)),
  };
}

export function toFlowLogicalPosition(
  position: { x: number; y: number },
  direction: FlowDirection,
): FlowLogicalPosition {
  return direction === "left-right"
    ? {
        primary: position.x,
        secondary: position.y,
      }
    : {
        primary: position.y,
        secondary: position.x,
      };
}

export function fromFlowLogicalPosition(
  logicalPosition: FlowLogicalPosition,
  direction: FlowDirection,
) {
  return direction === "left-right"
    ? roundPosition({
        x: logicalPosition.primary,
        y: logicalPosition.secondary,
      })
    : roundPosition({
        x: logicalPosition.secondary,
        y: logicalPosition.primary,
      });
}

export function resolveFlowRolePriority(node: DiagramLayoutNode) {
  if (node.kind === "project" || node.diagramRole === "flow-start") {
    return 0;
  }

  if (node.diagramRole === "flow-decision") {
    return 1;
  }

  if (node.diagramRole === "flow-step" || node.kind === "flow-step") {
    return 2;
  }

  if (node.diagramRole === "flow-end") {
    return 3;
  }

  if (isFlowNoteNode(node)) {
    return 4;
  }

  return 5;
}

export function compareFlowNodesByVisualOrder(
  nodeA: DiagramLayoutNode,
  nodeB: DiagramLayoutNode,
  direction: FlowDirection,
) {
  const logicalA = toFlowLogicalPosition(nodeA.position, direction);
  const logicalB = toFlowLogicalPosition(nodeB.position, direction);
  const rolePriorityDifference = resolveFlowRolePriority(nodeA) - resolveFlowRolePriority(nodeB);

  if (rolePriorityDifference !== 0) {
    return rolePriorityDifference;
  }

  if (logicalA.primary !== logicalB.primary) {
    return logicalA.primary - logicalB.primary;
  }

  if (logicalA.secondary !== logicalB.secondary) {
    return logicalA.secondary - logicalB.secondary;
  }

  return nodeA.id.localeCompare(nodeB.id);
}

export function toFlowLogicalBox(
  position: FlowLogicalPosition,
  footprint: FlowLogicalFootprint,
): FlowLogicalBox {
  return {
    primaryStart: position.primary,
    primaryEnd: position.primary + footprint.primarySpan,
    secondaryStart: position.secondary,
    secondaryEnd: position.secondary + footprint.secondarySpan,
  };
}

export function expandFlowLogicalBox(
  box: FlowLogicalBox,
  footprint: FlowLogicalFootprint,
): FlowLogicalBox {
  return {
    primaryStart: box.primaryStart - footprint.paddingPrimary / 2,
    primaryEnd: box.primaryEnd + footprint.paddingPrimary / 2,
    secondaryStart: box.secondaryStart - footprint.paddingSecondary / 2,
    secondaryEnd: box.secondaryEnd + footprint.paddingSecondary / 2,
  };
}

export function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  return startA < endB && startB < endA;
}

export function alignFlowSecondaryStarts(input: {
  anchorPosition: FlowLogicalPosition;
  anchorFootprint: FlowLogicalFootprint;
  targetFootprint: FlowLogicalFootprint;
}) {
  return (
    input.anchorPosition.secondary +
    (input.anchorFootprint.secondarySpan - input.targetFootprint.secondarySpan) / 2
  );
}

export function isFlowLogicalOverlap(input: {
  positionA: FlowLogicalPosition;
  footprintA: FlowLogicalFootprint;
  positionB: FlowLogicalPosition;
  footprintB: FlowLogicalFootprint;
}) {
  const expandedBoxA = expandFlowLogicalBox(
    toFlowLogicalBox(input.positionA, input.footprintA),
    input.footprintA,
  );
  const expandedBoxB = expandFlowLogicalBox(
    toFlowLogicalBox(input.positionB, input.footprintB),
    input.footprintB,
  );

  return (
    rangesOverlap(
      expandedBoxA.primaryStart,
      expandedBoxA.primaryEnd,
      expandedBoxB.primaryStart,
      expandedBoxB.primaryEnd,
    ) &&
    rangesOverlap(
      expandedBoxA.secondaryStart,
      expandedBoxA.secondaryEnd,
      expandedBoxB.secondaryStart,
      expandedBoxB.secondaryEnd,
    )
  );
}

export function isFlowLogicalSlotFree(input: {
  candidate: FlowLogicalPosition;
  candidateFootprint: FlowLogicalFootprint;
  nodes: DiagramLayoutNode[];
  direction: FlowDirection;
}) {
  return input.nodes.every((node) => {
    const logicalPosition = toFlowLogicalPosition(node.position, input.direction);
    const footprint = resolveFlowLogicalFootprint({
      direction: input.direction,
      node,
    });

    return !isFlowLogicalOverlap({
      positionA: input.candidate,
      footprintA: input.candidateFootprint,
      positionB: logicalPosition,
      footprintB: footprint,
    });
  });
}
