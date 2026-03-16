import {
  AssistantCreationSettingsSchema,
  AssistantDraftSchema,
  applyResolvedSourceLifecycleToDraft,
  redactAssistantDraft,
  type AssistantDraft,
} from "@/src/modules/creation-assistant/domain";
import {
  LOCAL_DRAFT_KEY,
  parseError,
  STEPS,
  type CreationAssistantMode,
} from "../shared";

type UseCreationDraftSyncInput = {
  mode: CreationAssistantMode;
  fromProjectId?: string;
  draft: AssistantDraft;
  draftVersion: number | null;
  setDraft: React.Dispatch<React.SetStateAction<AssistantDraft>>;
  setDraftVersion: (next: number | null) => void;
  setError: (error: string | null) => void;
  setSuccess: (message: string | null) => void;
  setIsBusy: (busy: boolean) => void;
  stepIndex: number;
  setStepIndex: React.Dispatch<React.SetStateAction<number>>;
  setUnlocked: React.Dispatch<React.SetStateAction<number>>;
  onCreated: (redirectUrl: string) => void;
};

export function useCreationDraftSync(input: UseCreationDraftSyncInput) {
  async function persistDraft(silent: boolean) {
    const resolvedDraft = applyResolvedSourceLifecycleToDraft(input.draft);
    const redactedDraft = redactAssistantDraft(resolvedDraft);

    if (input.mode === "new") {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(redactedDraft));
      }
      if (!silent) {
        input.setSuccess("Rascunho salvo localmente.");
      }
      return;
    }

    if (!input.fromProjectId) {
      return;
    }

    AssistantCreationSettingsSchema.parse({
      profile: input.draft.profile,
      startStrategy: input.draft.startStrategy,
      ...(redactedDraft.startSource ? { startSource: redactedDraft.startSource } : {}),
      ...(redactedDraft.templatePreset
        ? { templatePreset: redactedDraft.templatePreset }
        : {}),
      ...(redactedDraft.sourceConfig ? { sourceConfig: redactedDraft.sourceConfig } : {}),
      ...(redactedDraft.sourceStatus ? { sourceStatus: redactedDraft.sourceStatus } : {}),
      ...(redactedDraft.precheckResult
        ? { precheckResult: redactedDraft.precheckResult }
        : {}),
      ...(redactedDraft.lastError ? { lastError: redactedDraft.lastError } : {}),
      ...(redactedDraft.lastCheckedAt
        ? { lastCheckedAt: redactedDraft.lastCheckedAt }
        : {}),
      initialView: redactedDraft.initialView,
      layout: redactedDraft.layout,
      detailLevel: redactedDraft.detailLevel,
      automation: redactedDraft.automation,
      context: redactedDraft.context,
    });

    const response = await fetch(`/api/projects/${input.fromProjectId}/creation-draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft: redactedDraft,
        ...(input.draftVersion ? { expectedDraftVersion: input.draftVersion } : {}),
      }),
    });

    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      if (
        response.status === 409 &&
        payload.code === "CREATION_DRAFT_VERSION_CONFLICT" &&
        payload.latestDraft
      ) {
        const parsedLatest = AssistantDraftSchema.safeParse(payload.latestDraft);
        if (parsedLatest.success) {
          input.setDraft(redactAssistantDraft(parsedLatest.data));
          if (typeof payload.actualVersion === "number") {
            input.setDraftVersion(payload.actualVersion);
          }
        }
        throw new Error(
          "Havia uma versao mais recente do rascunho no servidor. Carregamos a ultima versao para continuar.",
        );
      }
      throw new Error(parseError(payload, "Falha ao salvar rascunho."));
    }

    const nextVersion =
      typeof payload.data === "object" &&
      payload.data !== null &&
      "draft" in payload.data &&
      typeof (payload.data as { draft?: { version?: unknown } }).draft?.version ===
        "number"
        ? (payload.data as { draft: { version: number } }).draft.version
        : undefined;

    if (typeof nextVersion === "number") {
      input.setDraftVersion(nextVersion);
    }

    if (!silent) {
      input.setSuccess("Rascunho salvo no servidor.");
    }
  }

  async function moveNext() {
    input.setError(null);
    input.setSuccess(null);
    const valid = AssistantDraftSchema.safeParse(input.draft).success;
    if (!valid) {
      input.setError("Revise os dados da etapa atual.");
      return;
    }
    input.setIsBusy(true);
    try {
      await persistDraft(true);
      const next = Math.min(input.stepIndex + 1, STEPS.length - 1);
      input.setStepIndex(next);
      input.setUnlocked((current) => Math.max(current, next));
    } catch (reason) {
      input.setError(
        reason instanceof Error ? reason.message : "Falha ao avancar etapa.",
      );
    } finally {
      input.setIsBusy(false);
    }
  }

  async function saveDraft() {
    input.setError(null);
    input.setSuccess(null);
    input.setIsBusy(true);
    try {
      await persistDraft(false);
    } catch (reason) {
      input.setError(
        reason instanceof Error ? reason.message : "Falha ao salvar rascunho.",
      );
    } finally {
      input.setIsBusy(false);
    }
  }

  async function validatePrismaSource() {
    if (
      input.mode !== "existing" ||
      !input.fromProjectId ||
      input.draft.sourceConfig?.kind !== "prisma-schema" ||
      !input.draft.sourceConfig.schemaText?.trim()
    ) {
      input.setError(
        "Cole um schema Prisma valido para verificacao inicial/importacao.",
      );
      return;
    }

    input.setError(null);
    input.setSuccess(null);
    input.setIsBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${input.fromProjectId}/imports/prisma-schema`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: input.draft.sourceConfig.schemaText.trim(),
          }),
        },
      );
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          parseError(payload, "Falha na verificacao inicial do schema Prisma."),
        );
      }

      input.setDraft((current) =>
        applyResolvedSourceLifecycleToDraft(current, {
          markAsImported: true,
          checkedAt: new Date(),
        }),
      );
      input.setSuccess(
        "Verificacao inicial concluida e importacao executada no projeto atual.",
      );
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Falha na verificacao inicial da fonte.";
      input.setDraft((current) =>
        applyResolvedSourceLifecycleToDraft(current, {
          markAsFailed: message,
          checkedAt: new Date(),
        }),
      );
      input.setError(message);
    } finally {
      input.setIsBusy(false);
    }
  }

  async function finishCreation() {
    input.setError(null);
    input.setSuccess(null);
    input.setIsBusy(true);
    try {
      const endpoint =
        input.mode === "new"
          ? "/api/projects/create-with-assistant"
          : `/api/projects/${input.fromProjectId}/creation-apply`;
      const redactedDraft = redactAssistantDraft(
        applyResolvedSourceLifecycleToDraft(input.draft),
      );
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          input.mode === "new"
            ? JSON.stringify(redactedDraft)
            : JSON.stringify({
                createInitialMap: true,
                draft: redactedDraft,
              }),
      });
      const payload = (await response.json()) as { data?: { redirectUrl?: string } };
      if (!response.ok) {
        throw new Error(parseError(payload, "Falha ao criar mapa inicial."));
      }
      if (input.mode === "new" && typeof window !== "undefined") {
        window.localStorage.removeItem(LOCAL_DRAFT_KEY);
      }
      if (payload.data?.redirectUrl) {
        input.onCreated(payload.data.redirectUrl);
      }
    } catch (reason) {
      input.setError(
        reason instanceof Error ? reason.message : "Falha ao criar mapa inicial.",
      );
    } finally {
      input.setIsBusy(false);
    }
  }

  return {
    persistDraft,
    moveNext,
    saveDraft,
    validatePrismaSource,
    finishCreation,
  };
}
