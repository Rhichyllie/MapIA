import { BaseEdge, type EdgeProps } from "@xyflow/react";

type ParallelMeta = {
  parallelIndex?: number;
  parallelTotal?: number;
};

const PARALLEL_EDGE_OFFSET = 22;

function toNumberOrFallback(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

type Point = {
  x: number;
  y: number;
};

type FlowEdgeVisualRole = "main" | "decision" | "alternate" | "reference";
type FlowEdgeLabelPlacement = "center" | "source" | "target";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(start: number, end: number, factor: number) {
  return start + (end - start) * factor;
}

function buildRoundedPolylinePath(points: Point[], radius: number) {
  if (points.length < 2) {
    return "";
  }

  let path = `M ${points[0].x},${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingX = current.x - previous.x;
    const incomingY = current.y - previous.y;
    const outgoingX = next.x - current.x;
    const outgoingY = next.y - current.y;
    const incomingLength = Math.hypot(incomingX, incomingY);
    const outgoingLength = Math.hypot(outgoingX, outgoingY);

    if (incomingLength === 0 || outgoingLength === 0) {
      continue;
    }

    const normalizedIncomingX = incomingX / incomingLength;
    const normalizedIncomingY = incomingY / incomingLength;
    const normalizedOutgoingX = outgoingX / outgoingLength;
    const normalizedOutgoingY = outgoingY / outgoingLength;
    const cornerRadius = Math.min(
      radius,
      incomingLength / 2,
      outgoingLength / 2,
    );
    const cornerStart = {
      x: current.x - normalizedIncomingX * cornerRadius,
      y: current.y - normalizedIncomingY * cornerRadius,
    };
    const cornerEnd = {
      x: current.x + normalizedOutgoingX * cornerRadius,
      y: current.y + normalizedOutgoingY * cornerRadius,
    };

    path += ` L ${cornerStart.x},${cornerStart.y}`;
    path += ` Q ${current.x},${current.y} ${cornerEnd.x},${cornerEnd.y}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x},${last.y}`;
  return path;
}

function buildDefaultParallelPath(props: EdgeProps, offset: number) {
  const deltaX = props.targetX - props.sourceX;
  const deltaY = props.targetY - props.sourceY;
  const edgeLength = Math.hypot(deltaX, deltaY) || 1;
  const normalX = -deltaY / edgeLength;
  const normalY = deltaX / edgeLength;
  const controlX = (props.sourceX + props.targetX) / 2 + normalX * offset;
  const controlY = (props.sourceY + props.targetY) / 2 + normalY * offset;

  return {
    edgePath: `M ${props.sourceX},${props.sourceY} Q ${controlX},${controlY} ${props.targetX},${props.targetY}`,
    labelX: 0.25 * props.sourceX + 0.5 * controlX + 0.25 * props.targetX,
    labelY: 0.25 * props.sourceY + 0.5 * controlY + 0.25 * props.targetY,
  };
}

function buildProcessParallelPath(input: {
  props: EdgeProps;
  offset: number;
  semanticRole: FlowEdgeVisualRole;
  labelPlacement: FlowEdgeLabelPlacement;
}) {
  const { props, offset, semanticRole, labelPlacement } = input;
  const deltaX = props.targetX - props.sourceX;
  const deltaY = props.targetY - props.sourceY;
  const isHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  const forward = isHorizontal
    ? Math.sign(deltaX === 0 ? 1 : deltaX)
    : Math.sign(deltaY === 0 ? 1 : deltaY);
  const lead = clamp(
    (isHorizontal ? Math.abs(deltaX) : Math.abs(deltaY)) * 0.18,
    30,
    72,
  );
  const labelFraction =
    labelPlacement === "source"
      ? 0.24
      : labelPlacement === "target"
        ? 0.78
        : 0.5;
  const cornerRadius =
    semanticRole === "decision"
      ? 20
      : semanticRole === "alternate"
        ? 18
        : semanticRole === "reference"
          ? 16
          : 20;

  if (isHorizontal) {
    const sourceStemX = props.sourceX + lead * forward;
    const targetStemX =
      semanticRole === "alternate"
        ? props.targetX - clamp(lead * 0.74, 28, 58) * forward
        : props.targetX - lead * forward;
    if (Math.abs(targetStemX - sourceStemX) < 24) {
      return buildDefaultParallelPath(props, offset);
    }
    if (semanticRole === "alternate") {
      const points: Point[] = [
        { x: props.sourceX, y: props.sourceY },
        { x: sourceStemX, y: props.sourceY },
        { x: targetStemX, y: props.sourceY },
        { x: targetStemX, y: props.targetY },
        { x: props.targetX, y: props.targetY },
      ];

      return {
        edgePath: buildRoundedPolylinePath(points, cornerRadius),
        labelX: targetStemX + 10 * forward,
        labelY: props.targetY - Math.sign(deltaY || 1) * 16,
      };
    }

    const branchDirection =
      deltaY === 0 ? Math.sign(offset === 0 ? 1 : offset) : Math.sign(deltaY);
    const spineY =
      semanticRole === "decision"
        ? props.sourceY +
          branchDirection * clamp(Math.max(Math.abs(deltaY), 76), 60, 124) +
          offset * 0.16
        : semanticRole === "reference"
          ? props.sourceY + deltaY * 0.4 + offset * 0.45
          : props.sourceY + deltaY / 2 + offset * 0.34;
    const points: Point[] = [
      { x: props.sourceX, y: props.sourceY },
      { x: sourceStemX, y: props.sourceY },
      { x: sourceStemX, y: spineY },
      { x: targetStemX, y: spineY },
      { x: targetStemX, y: props.targetY },
      { x: props.targetX, y: props.targetY },
    ];
    const labelOffsetY =
      semanticRole === "decision"
        ? branchDirection * 18
        : semanticRole === "reference"
          ? -18
          : labelPlacement === "target"
            ? -14
            : -12;

    return {
      edgePath: buildRoundedPolylinePath(points, cornerRadius),
      labelX: interpolate(sourceStemX, targetStemX, labelFraction),
      labelY: spineY + labelOffsetY,
    };
  }

  const sourceStemY = props.sourceY + lead * forward;
  const targetStemY =
    semanticRole === "alternate"
      ? props.targetY - clamp(lead * 0.74, 28, 58) * forward
      : props.targetY - lead * forward;
  if (Math.abs(targetStemY - sourceStemY) < 24) {
    return buildDefaultParallelPath(props, offset);
  }
  if (semanticRole === "alternate") {
    const points: Point[] = [
      { x: props.sourceX, y: props.sourceY },
      { x: props.sourceX, y: sourceStemY },
      { x: props.sourceX, y: targetStemY },
      { x: props.targetX, y: targetStemY },
      { x: props.targetX, y: props.targetY },
    ];

    return {
      edgePath: buildRoundedPolylinePath(points, cornerRadius),
      labelX: props.targetX - Math.sign(deltaX || 1) * 16,
      labelY: targetStemY + 10 * forward,
    };
  }

  const branchDirection =
    deltaX === 0 ? Math.sign(offset === 0 ? 1 : offset) : Math.sign(deltaX);
  const spineX =
    semanticRole === "decision"
      ? props.sourceX +
        branchDirection * clamp(Math.max(Math.abs(deltaX), 76), 60, 124) +
        offset * 0.16
      : semanticRole === "reference"
        ? props.sourceX + deltaX * 0.4 + offset * 0.45
        : props.sourceX + deltaX / 2 + offset * 0.34;
  const points: Point[] = [
    { x: props.sourceX, y: props.sourceY },
    { x: props.sourceX, y: sourceStemY },
    { x: spineX, y: sourceStemY },
    { x: spineX, y: targetStemY },
    { x: props.targetX, y: targetStemY },
    { x: props.targetX, y: props.targetY },
  ];
  const labelOffsetX =
    semanticRole === "decision"
      ? branchDirection * 18
      : semanticRole === "reference"
        ? 18
        : labelPlacement === "target"
          ? 14
          : 12;

  return {
    edgePath: buildRoundedPolylinePath(points, cornerRadius),
    labelX: spineX + labelOffsetX,
    labelY: interpolate(sourceStemY, targetStemY, labelFraction),
  };
}

export function ParallelBezierEdge(props: EdgeProps) {
  const data = props.data as ParallelMeta | undefined;
  const edgeClassName = (props as EdgeProps & { className?: string }).className;
  const isFlowEdge = edgeClassName?.includes("editor-edge-flow") ?? false;
  const semanticRole: FlowEdgeVisualRole = edgeClassName?.includes(
    "editor-edge-flow-role-reference",
  )
    ? "reference"
    : edgeClassName?.includes("editor-edge-flow-role-decision")
      ? "decision"
      : edgeClassName?.includes("editor-edge-flow-role-alternate")
        ? "alternate"
        : "main";
  const labelPlacement: FlowEdgeLabelPlacement = edgeClassName?.includes(
    "editor-edge-flow-label-source",
  )
    ? "source"
    : edgeClassName?.includes("editor-edge-flow-label-target")
      ? "target"
      : "center";
  const parallelIndex = toNumberOrFallback(data?.parallelIndex, 0);
  const parallelTotal = Math.max(1, toNumberOrFallback(data?.parallelTotal, 1));
  const centeredIndex = parallelIndex - (parallelTotal - 1) / 2;
  const semanticOffset =
    semanticRole === "decision"
      ? 44
      : semanticRole === "reference"
        ? -34
        : semanticRole === "alternate"
          ? 26
          : 0;
  const offset = centeredIndex * PARALLEL_EDGE_OFFSET + semanticOffset;
  const resolvedPath = isFlowEdge
    ? buildProcessParallelPath({
        props,
        offset,
        semanticRole,
        labelPlacement,
      })
    : buildDefaultParallelPath(props, offset);

  return (
    <BaseEdge
      id={props.id}
      path={resolvedPath.edgePath}
      markerEnd={props.markerEnd}
      style={props.style}
      className={edgeClassName}
      label={props.label}
      labelX={resolvedPath.labelX}
      labelY={resolvedPath.labelY}
      labelShowBg={props.labelShowBg}
      labelStyle={props.labelStyle}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
      interactionWidth={props.interactionWidth}
    />
  );
}
