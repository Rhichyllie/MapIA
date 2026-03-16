import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantDraftSchema, type AssistantDraft } from "@/src/modules/creation-assistant/domain";
import { useCreationDraftSync } from "./use-creation-draft-sync";

function buildDraft(partial: Partial<AssistantDraft>): AssistantDraft {
  return AssistantDraftSchema.parse({
    projectName: "Projeto de teste",
    profile: "data-model",
    startStrategy: "manual",
    initialView: "erd",
    layout: "auto",
    detailLevel: "intermediate",
    automation: {
      inferRelations: true,
      createLinkFields: true,
      applySuggestedNames: true,
      autoOrganizeOnCreate: true,
      detectInconsistenciesEarly: true,
    },
    context: {},
    ...partial,
  });
}

function buildSyncInput(draft: AssistantDraft, overrides?: { draftVersion?: number | null }) {
  return {
    mode: "existing" as const,
    fromProjectId: "95cb1d2f-e63a-4ad5-8ede-5e21dd1f9711",
    draft,
    draftVersion: overrides?.draftVersion ?? 2,
    setDraft: vi.fn(),
    setDraftVersion: vi.fn(),
    setError: vi.fn(),
    setSuccess: vi.fn(),
    setIsBusy: vi.fn(),
    stepIndex: 1,
    setStepIndex: vi.fn(),
    setUnlocked: vi.fn(),
    onCreated: vi.fn(),
  };
}

describe("useCreationDraftSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("increments draft version when expectedDraftVersion matches", async () => {
    const draft = buildDraft({
      startStrategy: "import",
      startSource: "postgres",
      sourceConfig: {
        kind: "postgres",
        connectionMode: "fields",
        host: "localhost",
        port: 5432,
        database: "mapia",
        authMode: "userpass",
        sslMode: "require",
        username: "mapia-user",
        password: "super-secret",
      },
    });
    const input = buildSyncInput(draft);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          draft: {
            version: 3,
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const sync = useCreationDraftSync(input);
    await sync.saveDraft();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    const payload = JSON.parse(request.body);
    expect(payload.expectedDraftVersion).toBe(2);
    expect(payload.draft.sourceConfig.password).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("super-secret");
    expect(input.setDraftVersion).toHaveBeenCalledWith(3);
    expect(input.setSuccess).toHaveBeenCalledWith("Rascunho salvo no servidor.");
  });

  it("handles conflict with latest redacted draft and updates local version", async () => {
    const baseDraft = buildDraft({
      startStrategy: "import",
      startSource: "postgres",
      sourceConfig: {
        kind: "postgres",
        connectionMode: "fields",
        host: "localhost",
        port: 5432,
        database: "mapia",
        authMode: "userpass",
        sslMode: "require",
        username: "mapia-user",
        password: "old-secret",
      },
    });
    const latestDraft = {
      ...baseDraft,
      sourceConfig: {
        ...baseDraft.sourceConfig!,
        password: "leaked-secret",
      },
    };
    const input = buildSyncInput(baseDraft);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: "CREATION_DRAFT_VERSION_CONFLICT",
        latestDraft,
        actualVersion: 7,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const sync = useCreationDraftSync(input);
    await sync.saveDraft();

    expect(input.setDraftVersion).toHaveBeenCalledWith(7);
    expect(input.setDraft).toHaveBeenCalledTimes(1);
    const syncedDraft = input.setDraft.mock.calls[0]?.[0] as AssistantDraft;
    expect(syncedDraft.sourceConfig?.kind).toBe("postgres");
    expect(
      (syncedDraft.sourceConfig as { password?: string }).password,
    ).toBeUndefined();
    expect(JSON.stringify(syncedDraft)).not.toContain("leaked-secret");
    expect(input.setError).toHaveBeenCalledWith(
      expect.stringContaining("versao mais recente"),
    );
  });
});
