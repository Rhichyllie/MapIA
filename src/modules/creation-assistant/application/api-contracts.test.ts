import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/src/lib/app-error";
import {
  __flushCreationTransitionTelemetryForTests,
  __resetCreationTransitionTelemetryForTests,
  __setCreationTransitionTelemetryRuntimeConfigForTests,
  __setCreationTransitionTelemetryStoreForTests,
  MemoryCreationTransitionTelemetryStore,
} from "@/src/server/observability";
import type { CreationTransitionTelemetryStore } from "@/src/server/observability/creation-transition-store";
import type {
  CreationTransitionEnvelope,
  CreationTransitionEventName,
} from "@/src/server/observability/creation-transition-contract";

const mocks = vi.hoisted(() => ({
  getApiSessionIdentityMock: vi.fn(),
  getProjectCreationDraftExecuteMock: vi.fn(),
  getProjectCreationSettingsExecuteMock: vi.fn(),
  getProjectCreationSettingsSummaryExecuteMock: vi.fn(),
  saveProjectCreationDraftExecuteMock: vi.fn(),
  applyProjectCreationExecuteMock: vi.fn(),
  createProjectWithAssistantExecuteMock: vi.fn(),
  getOwnedProjectExecuteMock: vi.fn(),
}));

vi.mock("@/src/server/auth/api-session", () => ({
  getApiSessionIdentity: mocks.getApiSessionIdentityMock,
}));

vi.mock("@/src/server/app/container", () => ({
  createServerUseCases: () => ({
    creationAssistant: {
      getProjectCreationDraft: {
        execute: mocks.getProjectCreationDraftExecuteMock,
      },
      getProjectCreationSettings: {
        execute: mocks.getProjectCreationSettingsExecuteMock,
      },
      getProjectCreationSettingsSummary: {
        execute: mocks.getProjectCreationSettingsSummaryExecuteMock,
      },
      saveProjectCreationDraft: {
        execute: mocks.saveProjectCreationDraftExecuteMock,
      },
      applyProjectCreation: {
        execute: mocks.applyProjectCreationExecuteMock,
      },
      createProjectWithAssistant: {
        execute: mocks.createProjectWithAssistantExecuteMock,
      },
    },
    projects: {
      getOwnedProject: {
        execute: mocks.getOwnedProjectExecuteMock,
      },
    },
  }),
}));

import {
  GET as getCreationDraftRoute,
  PUT as putCreationDraftRoute,
} from "@/app/api/projects/[projectId]/creation-draft/route";
import { POST as postCreationApplyRoute } from "@/app/api/projects/[projectId]/creation-apply/route";
import { PUT as putCreationSettingsAliasRoute } from "@/app/api/projects/[projectId]/creation-settings/route";
import { POST as postCreateWithAssistantRoute } from "@/app/api/projects/create-with-assistant/route";

const PROJECT_ID = "123e4567-e89b-12d3-a456-426614174199";
let telemetryStore: MemoryCreationTransitionTelemetryStore;

async function countEventByName(eventName: CreationTransitionEventName) {
  const counts = await telemetryStore.countByEventName({
    eventNames: [eventName],
    windowStart: new Date("2026-01-01T00:00:00.000Z"),
    windowEnd: new Date("2027-01-01T00:00:00.000Z"),
  });
  return counts[eventName];
}

class SlowMemoryStore implements CreationTransitionTelemetryStore {
  constructor(
    private readonly delayMs: number,
    private readonly delegate = new MemoryCreationTransitionTelemetryStore(),
  ) {}

  async insert(event: CreationTransitionEnvelope) {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return this.delegate.insert(event);
  }

  countByEventName = this.delegate.countByEventName.bind(this.delegate);
  listByEventName = this.delegate.listByEventName.bind(this.delegate);
  countDistinctProjectIds = this.delegate.countDistinctProjectIds.bind(this.delegate);
  countDistinctProjectsWithTemplateDependency =
    this.delegate.countDistinctProjectsWithTemplateDependency.bind(this.delegate);
  topTemplateFallbackReasons =
    this.delegate.topTemplateFallbackReasons.bind(this.delegate);
  countTemplateInheritedFields =
    this.delegate.countTemplateInheritedFields.bind(this.delegate);
  latestIngestedAt = this.delegate.latestIngestedAt.bind(this.delegate);
}

class FailingStore implements CreationTransitionTelemetryStore {
  async insert(): Promise<{ status: "stored" } | { status: "deduped" }> {
    throw new Error("sink-offline");
  }

  async countByEventName(input: {
    eventNames: Parameters<CreationTransitionTelemetryStore["countByEventName"]>[0]["eventNames"];
    windowStart: Date;
    windowEnd: Date;
  }) {
    return Object.fromEntries(input.eventNames.map((eventName) => [eventName, 0])) as Record<
      string,
      number
    >;
  }

  async listByEventName() {
    return [];
  }

  async countDistinctProjectIds() {
    return 0;
  }

  async countDistinctProjectsWithTemplateDependency() {
    return 0;
  }

  async latestIngestedAt() {
    return null;
  }

  async topTemplateFallbackReasons() {
    return [];
  }

  async countTemplateInheritedFields() {
    return {
      profile: 0,
      initialView: 0,
      layout: 0,
      contextDefaults: 0,
    };
  }
}

describe("creation assistant api contracts", () => {
  beforeEach(() => {
    __resetCreationTransitionTelemetryForTests();
    telemetryStore = new MemoryCreationTransitionTelemetryStore();
    __setCreationTransitionTelemetryStoreForTests(
      telemetryStore,
    );
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      enabled: true,
      sinkTimeoutMs: 120,
      gateEvaluationIntervalMs: Number.MAX_SAFE_INTEGER,
      logThrottleMs: 60000,
    });
    mocks.getApiSessionIdentityMock.mockResolvedValue({
      identity: "owner@mapia.local",
    });
    mocks.getProjectCreationDraftExecuteMock.mockResolvedValue(null);
    mocks.getProjectCreationSettingsExecuteMock.mockResolvedValue(null);
    mocks.getProjectCreationSettingsSummaryExecuteMock.mockResolvedValue({
      draftExists: false,
      draftVersion: null,
      draftUpdatedAt: null,
      applied: null,
    });
    mocks.getOwnedProjectExecuteMock.mockResolvedValue({
      name: "Projeto",
      description: null,
    });
  });

  afterEach(async () => {
    await __flushCreationTransitionTelemetryForTests();
    __resetCreationTransitionTelemetryForTests();
    vi.clearAllMocks();
  });

  it("PUT /creation-draft does not return raw secrets", async () => {
    mocks.saveProjectCreationDraftExecuteMock.mockResolvedValue({
      draft: {
        projectName: "Projeto",
        profile: "data-model",
        startStrategy: "import",
        startSource: "postgres",
        sourceConfig: {
          kind: "postgres",
          connectionMode: "fields",
          host: "db.internal",
          database: "mapia",
          authMode: "userpass",
          sslMode: "require",
          username: "readonly",
          password: "super-secret",
        },
        initialView: "erd",
        layout: "relational",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
      version: 3,
      updatedAt: new Date("2026-03-12T10:00:00.000Z"),
      updatedByIdentity: "owner@mapia.local",
    });

    const response = await putCreationDraftRoute(
      new Request("http://localhost/api/projects/x/creation-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            projectName: "Projeto",
            profile: "blank",
            startStrategy: "manual",
            initialView: "free",
            layout: "free",
            detailLevel: "intermediate",
            automation: {
              inferRelations: true,
              createLinkFields: true,
              applySuggestedNames: true,
              autoOrganizeOnCreate: true,
              detectInconsistenciesEarly: true,
            },
            context: {},
          },
          expectedDraftVersion: 2,
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("password");
  });

  it("draft conflict response returns latestDraft redacted", async () => {
    mocks.saveProjectCreationDraftExecuteMock.mockRejectedValue(
      new AppError("Rascunho desatualizado", {
        code: "CREATION_DRAFT_VERSION_CONFLICT",
        status: 409,
        details: {
          actualVersion: 4,
          expectedVersion: 2,
          latestDraft: {
            projectName: "Projeto",
            sourceConfig: {
              password: "secret-from-conflict",
              connectionString: "postgresql://secret",
            },
          },
        },
      }),
    );

    const response = await putCreationDraftRoute(
      new Request("http://localhost/api/projects/x/creation-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            projectName: "Projeto",
            profile: "blank",
            startStrategy: "manual",
            initialView: "free",
            layout: "free",
            detailLevel: "intermediate",
            automation: {
              inferRelations: true,
              createLinkFields: true,
              applySuggestedNames: true,
              autoOrganizeOnCreate: true,
              detectInconsistenciesEarly: true,
            },
            context: {},
          },
          expectedDraftVersion: 2,
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(409);
    const payload = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("secret-from-conflict");
    expect(serialized).not.toContain("postgresql://secret");
    expect(serialized).toContain("***REDACTED***");
  });

  it("POST /creation-apply returns applied metadata", async () => {
    mocks.applyProjectCreationExecuteMock.mockResolvedValue({
      projectId: PROJECT_ID,
      redirectUrl: `/editor?projectId=${PROJECT_ID}`,
      whatWillBeCreated: "Resumo",
      appliedVersion: 2,
      appliedAt: new Date("2026-03-12T11:00:00.000Z"),
      initialSnapshot: null,
      appliedSettings: {
        profile: "blank",
        startStrategy: "manual",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
    });

    const response = await postCreationApplyRoute(
      new Request("http://localhost/api/projects/x/creation-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createInitialMap: true,
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data?: {
        projectId?: string;
        appliedVersion?: number;
        appliedAt?: string | null;
      };
    };
    expect(payload.data?.projectId).toBe(PROJECT_ID);
    expect(payload.data?.appliedVersion).toBe(2);
    expect(payload.data?.appliedAt).toBe("2026-03-12T11:00:00.000Z");
  });

  it("POST /creation-apply returns 422 when strict validation blocks apply", async () => {
    mocks.applyProjectCreationExecuteMock.mockRejectedValue(
      new AppError("Rascunho nao atende validacao estrita para aplicacao.", {
        code: "CREATION_DRAFT_STRICT_VALIDATION_FAILED",
        status: 422,
        details: {
          blockingIssues: [
            "Com 'Criar inicio e fim automaticamente' ativo, habilite 'Criar exemplos automaticos' para gerar o plano inicial.",
          ],
          warnings: [],
        },
      }),
    );

    const response = await postCreationApplyRoute(
      new Request("http://localhost/api/projects/x/creation-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createInitialMap: true,
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(422);
    const payload = (await response.json()) as {
      code?: string;
      blockingIssues?: string[];
    };
    expect(payload.code).toBe("CREATION_DRAFT_STRICT_VALIDATION_FAILED");
    expect(payload.blockingIssues?.length).toBeGreaterThan(0);
  });

  it("GET /creation-draft returns draft version", async () => {
    mocks.getProjectCreationDraftExecuteMock.mockResolvedValue({
      draft: {
        projectName: "Projeto",
        profile: "blank",
        startStrategy: "manual",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
      version: 1,
      updatedAt: new Date("2026-03-12T11:00:00.000Z"),
    });

    const response = await getCreationDraftRoute(
      new Request("http://localhost/api/projects/x/creation-draft"),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data?: { draftVersion?: number | null };
    };
    expect(payload.data?.draftVersion).toBe(1);
  });

  it("keeps request path healthy with slow telemetry sink", async () => {
    vi.useRealTimers();
    __setCreationTransitionTelemetryRuntimeConfigForTests({
      sinkTimeoutMs: 10,
      gateEvaluationIntervalMs: 1,
    });
    __setCreationTransitionTelemetryStoreForTests(new SlowMemoryStore(100));

    mocks.saveProjectCreationDraftExecuteMock.mockResolvedValue({
      draft: {
        projectName: "Projeto",
        profile: "blank",
        startStrategy: "manual",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
      version: 2,
      updatedAt: new Date("2026-03-12T10:00:00.000Z"),
      updatedByIdentity: "owner@mapia.local",
    });

    const startedAt = Date.now();
    const response = await putCreationDraftRoute(
      new Request("http://localhost/api/projects/x/creation-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            projectName: "Projeto",
            profile: "blank",
            startStrategy: "manual",
            initialView: "free",
            layout: "free",
            detailLevel: "intermediate",
            automation: {
              inferRelations: true,
              createLinkFields: true,
              applySuggestedNames: true,
              autoOrganizeOnCreate: true,
              detectInconsistenciesEarly: true,
            },
            context: {},
          },
          expectedDraftVersion: 1,
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    const elapsed = Date.now() - startedAt;
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(80);
  });

  it("keeps request path healthy with failing telemetry sink", async () => {
    __setCreationTransitionTelemetryStoreForTests(new FailingStore());

    mocks.applyProjectCreationExecuteMock.mockResolvedValue({
      projectId: PROJECT_ID,
      redirectUrl: `/editor?projectId=${PROJECT_ID}`,
      whatWillBeCreated: "Resumo",
      appliedVersion: 2,
      appliedAt: new Date("2026-03-12T11:00:00.000Z"),
      initialSnapshot: null,
      appliedSettings: {
        profile: "blank",
        startStrategy: "manual",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
    });

    const response = await postCreationApplyRoute(
      new Request("http://localhost/api/projects/x/creation-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createInitialMap: true,
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
  });

  it("emits creation_draft_saved and source_status_changed exactly once on successful draft save", async () => {
    mocks.getProjectCreationDraftExecuteMock.mockResolvedValueOnce({
      draft: {
        sourceStatus: "not_configured",
      },
    });
    mocks.saveProjectCreationDraftExecuteMock.mockResolvedValueOnce({
      draft: {
        projectName: "Projeto",
        profile: "blank",
        startStrategy: "manual",
        sourceStatus: "configured",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
      version: 2,
      updatedAt: new Date("2026-03-12T10:00:00.000Z"),
      updatedByIdentity: "owner@mapia.local",
    });

    const response = await putCreationDraftRoute(
      new Request("http://localhost/api/projects/x/creation-draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            projectName: "Projeto",
            profile: "blank",
            startStrategy: "manual",
            sourceStatus: "configured",
            initialView: "free",
            layout: "free",
            detailLevel: "intermediate",
            automation: {
              inferRelations: true,
              createLinkFields: true,
              applySuggestedNames: true,
              autoOrganizeOnCreate: true,
              detectInconsistenciesEarly: true,
            },
            context: {},
          },
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await countEventByName("creation_draft_saved")).toBe(1);
    expect(await countEventByName("creation_source_status_changed")).toBe(1);
  });

  it("emits apply events exactly once on successful creation apply", async () => {
    mocks.getProjectCreationSettingsExecuteMock.mockResolvedValueOnce({
      sourceStatus: "ready_to_attempt_import",
    });
    mocks.applyProjectCreationExecuteMock.mockResolvedValueOnce({
      projectId: PROJECT_ID,
      redirectUrl: `/editor?projectId=${PROJECT_ID}`,
      whatWillBeCreated: "Resumo",
      appliedVersion: 2,
      appliedAt: new Date("2026-03-12T11:00:00.000Z"),
      initialSnapshot: null,
      appliedSettings: {
        profile: "data-model",
        startStrategy: "import",
        startSource: "postgres",
        sourceStatus: "imported",
        initialView: "erd",
        layout: "relational",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
    });

    const response = await postCreationApplyRoute(
      new Request("http://localhost/api/projects/x/creation-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createInitialMap: true }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await countEventByName("creation_apply_attempted")).toBe(1);
    expect(await countEventByName("creation_apply_succeeded")).toBe(1);
    expect(await countEventByName("creation_source_status_changed")).toBe(1);
  });

  it("emits alias put telemetry exactly once per successful alias write", async () => {
    mocks.getProjectCreationDraftExecuteMock.mockResolvedValueOnce({
      draft: {
        sourceStatus: "not_configured",
      },
    });
    mocks.saveProjectCreationDraftExecuteMock.mockResolvedValueOnce({
      draft: {
        projectName: "Projeto",
        profile: "blank",
        startStrategy: "manual",
        sourceStatus: "configured",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
      version: 3,
      updatedAt: new Date("2026-03-12T10:00:00.000Z"),
      updatedByIdentity: "owner@mapia.local",
    });

    const response = await putCreationSettingsAliasRoute(
      new Request("http://localhost/api/projects/x/creation-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            projectName: "Projeto",
            profile: "blank",
            startStrategy: "manual",
            sourceStatus: "configured",
            initialView: "free",
            layout: "free",
            detailLevel: "intermediate",
            automation: {
              inferRelations: true,
              createLinkFields: true,
              applySuggestedNames: true,
              autoOrganizeOnCreate: true,
              detectInconsistenciesEarly: true,
            },
            context: {},
          },
        }),
      }),
      { params: Promise.resolve({ projectId: PROJECT_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await countEventByName("creation_settings_alias_put")).toBe(1);
    expect(await countEventByName("creation_settings_alias_payload_settings")).toBe(
      0,
    );
    expect(await countEventByName("creation_draft_saved")).toBe(1);
    expect(await countEventByName("creation_source_status_changed")).toBe(1);
  });

  it("emits create-with-assistant success telemetry exactly once per request", async () => {
    mocks.createProjectWithAssistantExecuteMock.mockResolvedValueOnce({
      projectId: PROJECT_ID,
      initialSnapshot: null,
      redirectUrl: `/editor?projectId=${PROJECT_ID}`,
      appliedVersion: 1,
      appliedSettings: {
        profile: "blank",
        startStrategy: "manual",
        sourceStatus: "configured",
        initialView: "free",
        layout: "free",
        detailLevel: "intermediate",
        automation: {
          inferRelations: true,
          createLinkFields: true,
          applySuggestedNames: true,
          autoOrganizeOnCreate: true,
          detectInconsistenciesEarly: true,
        },
        context: {},
      },
    });

    const response = await postCreateWithAssistantRoute(
      new Request("http://localhost/api/projects/create-with-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: "Projeto",
          profile: "blank",
          startStrategy: "manual",
          sourceStatus: "configured",
          initialView: "free",
          layout: "free",
          detailLevel: "intermediate",
          automation: {
            inferRelations: true,
            createLinkFields: true,
            applySuggestedNames: true,
            autoOrganizeOnCreate: true,
            detectInconsistenciesEarly: true,
          },
          context: {},
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await countEventByName("creation_apply_attempted")).toBe(1);
    expect(await countEventByName("creation_apply_succeeded")).toBe(1);
    expect(await countEventByName("creation_source_status_changed")).toBe(1);
  });
});
