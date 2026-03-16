import type { EdgeKind, NodeKind } from "@/src/domain";
import type { DiagramRole } from "@/src/modules/diagrams/domain";
import {
  buildProcessEdgeOverview,
  buildProcessNodeOverview,
  getProcessInspectorCopy,
  getProcessRoleMeta,
  resolveProcessNodeRole,
  type ProcessEdgeOverview,
  type ProcessInspectorCopy,
  type ProcessNodeOverview,
  type ProcessNodeRole,
  type ProcessRelationsViewModel,
} from "../presentation/process-semantics";

export type ProcessNodeInspectorViewModel = {
  copy: ProcessInspectorCopy;
  role: ProcessNodeRole;
  selectionKindLabel: string;
  overview: ProcessNodeOverview;
};

export type ProcessEdgeInspectorViewModel = {
  copy: ProcessInspectorCopy;
  overview: ProcessEdgeOverview;
};

export function resolveProcessNodeInspectorViewModel(input: {
  diagramRole?: DiagramRole;
  kind: NodeKind;
  label: string;
  relations: ProcessRelationsViewModel;
}): ProcessNodeInspectorViewModel {
  const copy = getProcessInspectorCopy();
  const role = resolveProcessNodeRole({
    diagramRole: input.diagramRole,
    kind: input.kind,
    label: input.label,
  });
  const roleMeta = getProcessRoleMeta(role);

  return {
    copy,
    role,
    selectionKindLabel: role === "flow-step" ? roleMeta.kindLabel : roleMeta.badgeLabel,
    overview: buildProcessNodeOverview({
      role,
      incomingCount: input.relations.incomingCount,
      outgoingCount: input.relations.outgoingCount,
      relations: input.relations,
    }),
  };
}

export function resolveProcessEdgeInspectorViewModel(input: {
  kind: EdgeKind;
  label?: string;
  sourceLabel: string;
  targetLabel: string;
}): ProcessEdgeInspectorViewModel {
  return {
    copy: getProcessInspectorCopy(),
    overview: buildProcessEdgeOverview({
      kind: input.kind,
      label: input.label,
      sourceLabel: input.sourceLabel,
      targetLabel: input.targetLabel,
    }),
  };
}
