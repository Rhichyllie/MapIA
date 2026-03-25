import { useCallback, useState } from "react";
import type { EditorTranslationFn } from "../editor-i18n";
import type { InspectorMode } from "../editor-inspector-personas";
import { runSemanticAuditForEditor, type SemanticAuditPayload, type SemanticPolicyPayload } from "../editor-query-service";
import {
  type PendingConnectionAssistantState,
  type PendingNodeRepairState,
  type PendingSemanticOverrideState,
} from "./editor-shell-types";
import { formatErrorMessage } from "./editor-shell-utils";

type UseEditorSemanticControllerInput = {
  projectId: string;
  inspectorMode: InspectorMode;
  editorT: EditorTranslationFn;
  setQuerySyncMessage: (message: string | null) => void;
  setGlobalErrorMessage: (message: string | null) => void;
};

export function useEditorSemanticController({
  projectId,
  inspectorMode,
  editorT,
  setQuerySyncMessage,
  setGlobalErrorMessage,
}: UseEditorSemanticControllerInput) {
  const [pendingConnectionAssistant, setPendingConnectionAssistant] =
    useState<PendingConnectionAssistantState | null>(null);
  const [pendingNodeRepair, setPendingNodeRepair] =
    useState<PendingNodeRepairState | null>(null);
  const [pendingSemanticOverride, setPendingSemanticOverride] =
    useState<PendingSemanticOverrideState | null>(null);
  const [semanticOverrideReason, setSemanticOverrideReason] = useState("");
  const [isValidationPanelOpen, setIsValidationPanelOpen] = useState(false);
  const [serverSemanticAudit, setServerSemanticAudit] =
    useState<SemanticAuditPayload | null>(null);
  const [semanticPolicy, setSemanticPolicy] = useState<SemanticPolicyPayload | null>(
    null,
  );

  const runServerSemanticAudit = useCallback(async () => {
    try {
      const audit = await runSemanticAuditForEditor({
        projectId,
        mode: inspectorMode,
      });
      setServerSemanticAudit(audit);
      setQuerySyncMessage(
        editorT("shell.messages.auditCompleted", { count: audit.counters.total }),
      );
      setGlobalErrorMessage(null);
      return audit;
    } catch (error) {
      setServerSemanticAudit(null);
      const message = formatErrorMessage(
        error,
        editorT("shell.errors.serverSemanticAudit"),
      );
      setGlobalErrorMessage(message);
      return null;
    }
  }, [editorT, inspectorMode, projectId, setGlobalErrorMessage, setQuerySyncMessage]);

  const handleToggleValidationPanel = useCallback(async () => {
    const shouldOpen = !isValidationPanelOpen;
    setIsValidationPanelOpen(shouldOpen);

    if (!shouldOpen) {
      return;
    }

    await runServerSemanticAudit();
  }, [isValidationPanelOpen, runServerSemanticAudit]);

  const handleCancelConnectionAssistant = useCallback(() => {
    setPendingConnectionAssistant(null);
    setQuerySyncMessage(editorT("shell.messages.connectionCancelled"));
  }, [editorT, setQuerySyncMessage]);

  const handleCancelPendingNodeRepair = useCallback(() => {
    setPendingNodeRepair(null);
  }, []);

  const handleCancelSemanticOverride = useCallback(() => {
    setPendingSemanticOverride(null);
    setSemanticOverrideReason("");
  }, []);

  return {
    pendingConnectionAssistant,
    setPendingConnectionAssistant,
    pendingNodeRepair,
    setPendingNodeRepair,
    pendingSemanticOverride,
    setPendingSemanticOverride,
    semanticOverrideReason,
    setSemanticOverrideReason,
    isValidationPanelOpen,
    setIsValidationPanelOpen,
    serverSemanticAudit,
    setServerSemanticAudit,
    semanticPolicy,
    setSemanticPolicy,
    runServerSemanticAudit,
    handleToggleValidationPanel,
    handleCancelConnectionAssistant,
    handleCancelPendingNodeRepair,
    handleCancelSemanticOverride,
  };
}
