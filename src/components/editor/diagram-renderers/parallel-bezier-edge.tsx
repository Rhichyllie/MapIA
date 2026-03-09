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

export function ParallelBezierEdge(props: EdgeProps) {
  const data = props.data as ParallelMeta | undefined;
  const edgeClassName = (props as EdgeProps & { className?: string }).className;
  const parallelIndex = toNumberOrFallback(data?.parallelIndex, 0);
  const parallelTotal = Math.max(1, toNumberOrFallback(data?.parallelTotal, 1));
  const centeredIndex = parallelIndex - (parallelTotal - 1) / 2;
  const offset = centeredIndex * PARALLEL_EDGE_OFFSET;

  const deltaX = props.targetX - props.sourceX;
  const deltaY = props.targetY - props.sourceY;
  const edgeLength = Math.hypot(deltaX, deltaY) || 1;
  const normalX = -deltaY / edgeLength;
  const normalY = deltaX / edgeLength;
  const controlX = (props.sourceX + props.targetX) / 2 + normalX * offset;
  const controlY = (props.sourceY + props.targetY) / 2 + normalY * offset;
  const labelX = 0.25 * props.sourceX + 0.5 * controlX + 0.25 * props.targetX;
  const labelY = 0.25 * props.sourceY + 0.5 * controlY + 0.25 * props.targetY;
  const edgePath = `M ${props.sourceX},${props.sourceY} Q ${controlX},${controlY} ${props.targetX},${props.targetY}`;

  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      markerEnd={props.markerEnd}
      style={props.style}
      className={edgeClassName}
      label={props.label}
      labelX={labelX}
      labelY={labelY}
      labelShowBg={props.labelShowBg}
      labelStyle={props.labelStyle}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
      interactionWidth={props.interactionWidth}
    />
  );
}
