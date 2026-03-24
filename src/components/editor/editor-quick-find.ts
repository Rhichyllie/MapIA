import { translateEditor, type EditorTranslationFn } from "./editor-i18n";
import type { RFNode } from "./editor-graph-mappers";
import type { PresentationMode } from "./presentation/kinds";
import { getNodeKindLabel, getOperationalDisplayLabel } from "./presentation/kinds";

export type NodeQuickFindOption = {
  id: string;
  label: string;
  kindLabel: string;
  kindRaw: string;
};

function scoreOption(option: NodeQuickFindOption, query: string) {
  const normalizedLabel = option.label.toLowerCase();

  if (normalizedLabel === query) {
    return 0;
  }

  if (normalizedLabel.startsWith(query)) {
    return 1;
  }

  if (normalizedLabel.includes(query)) {
    return 2;
  }

  return 3;
}

export function filterNodeQuickFindOptions(
  nodes: RFNode[],
  query: string,
  mode: PresentationMode,
  t?: EditorTranslationFn,
  limit = 40,
) {
  const normalizedQuery = query.trim().toLowerCase();

  const options = nodes.map<NodeQuickFindOption>((node) => ({
    id: node.id,
    label:
      mode === "operational"
        ? getOperationalDisplayLabel({
            label: node.data.label,
            payload: node.data.payload,
          }, t)
        : node.data.label?.trim() || translateEditor(t, "presentation.fallbacks.untitledNode"),
    kindLabel: getNodeKindLabel(node.data.kind, mode, t),
    kindRaw: node.data.kind,
  }));

  if (!normalizedQuery) {
    return options
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }))
      .slice(0, limit);
  }

  return options
    .filter((option) => {
      const normalizedLabel = option.label.toLowerCase();
      return (
        normalizedLabel.includes(normalizedQuery) ||
        option.id.includes(normalizedQuery) ||
        option.kindLabel.toLowerCase().includes(normalizedQuery) ||
        option.kindRaw.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((a, b) => {
      const scoreA = scoreOption(a, normalizedQuery);
      const scoreB = scoreOption(b, normalizedQuery);

      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      return a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
    })
    .slice(0, limit);
}
