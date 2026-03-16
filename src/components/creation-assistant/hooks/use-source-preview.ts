import { useMemo } from "react";
import { resolveSourceConfigPreview, type AssistantDraft } from "@/src/modules/creation-assistant/domain";

export function useSourcePreview(draft: AssistantDraft) {
  return useMemo(() => resolveSourceConfigPreview(draft.sourceConfig), [draft.sourceConfig]);
}
