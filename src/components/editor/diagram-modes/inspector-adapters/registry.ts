import type { ComponentType } from "react";
import type { EditorDiagramInspectorStrategy } from "../types";
import { ErdInspectorAdapter } from "./erd-inspector-adapter";
import { FlowInspectorAdapter } from "./flow-inspector-adapter";
import { GraphInspectorAdapter } from "./graph-inspector-adapter";
import type { EditorDiagramInspectorAdapterProps } from "./types";

type InspectorAdapterComponent = ComponentType<EditorDiagramInspectorAdapterProps>;

const ADAPTERS: Record<EditorDiagramInspectorStrategy["kind"], InspectorAdapterComponent> = {
  default: GraphInspectorAdapter,
  graph: GraphInspectorAdapter,
  erd: ErdInspectorAdapter,
  process: FlowInspectorAdapter,
};

export function resolveEditorDiagramInspectorAdapter(
  kind: EditorDiagramInspectorStrategy["kind"],
) {
  return ADAPTERS[kind];
}
