import Link from "next/link";
import type { EditorSnapshotVersionSummary } from "../editor-query-service";
import type { EditorTranslationFn } from "../editor-i18n";
import type { VersionDiffSummaryResult } from "../versions/diff-summary";
import {
  formatVersionCreatedAtLabel,
  formatVersionOriginLabel,
} from "./editor-shell-utils";
import type {
  PrismaSchemaImportFeedback,
  VersionActionFeedback,
  VersionCreateFeedback,
  VersionDiffFeedback,
} from "./editor-shell-types";

type ProjectPanelIdentity = {
  id: string;
  name: string;
};

type EditorMetadataPanelProps = {
  editorT: EditorTranslationFn;
  project: ProjectPanelIdentity;
  diagramDefinitionLabel: string;
  rendererLabel: string;
  isSupportedDiagramType: boolean;
  layoutPolicyLabel: string;
  isReapplyLayoutBlockedByPolicy: boolean;
  isOpen: boolean;
  onToggle: () => void;
  pendingCount: number;
  nodeCount: number;
  edgeCount: number;
  lastSavedAtLabel: string | null;
  saveMessage?: string;
  isRefreshingFromQuery: boolean;
  querySyncMessage: string | null;
  onRemoveSelected: () => void;
  isRemoveSelectedDisabled: boolean;
  onManualSave: () => void;
  isManualSaveDisabled: boolean;
  isSaving: boolean;
  newVersionName: string;
  onNewVersionNameChange: (value: string) => void;
  onCreateVersion: () => void;
  isCreateVersionDisabled: boolean;
  isCreatingVersion: boolean;
  onReapplyLayout: () => void;
  isReapplyLayoutDisabled: boolean;
  hasDiagramRendererMismatch: boolean;
  versionCreateFeedback: VersionCreateFeedback;
};

export function EditorMetadataPanel({
  editorT,
  project,
  diagramDefinitionLabel,
  rendererLabel,
  isSupportedDiagramType,
  layoutPolicyLabel,
  isReapplyLayoutBlockedByPolicy,
  isOpen,
  onToggle,
  pendingCount,
  nodeCount,
  edgeCount,
  lastSavedAtLabel,
  saveMessage,
  isRefreshingFromQuery,
  querySyncMessage,
  onRemoveSelected,
  isRemoveSelectedDisabled,
  onManualSave,
  isManualSaveDisabled,
  isSaving,
  newVersionName,
  onNewVersionNameChange,
  onCreateVersion,
  isCreateVersionDisabled,
  isCreatingVersion,
  onReapplyLayout,
  isReapplyLayoutDisabled,
  hasDiagramRendererMismatch,
  versionCreateFeedback,
}: EditorMetadataPanelProps) {
  return (
    <section className="panel editor-secondary-panel editor-panel-metadata">
      <header className="panel-header">
        <div>
          <h3>{project.name}</h3>
          <p>{editorT("shell.metadata.description")}</p>
        </div>
        <div className="row-actions">
          <span
            className={`badge ${isSupportedDiagramType ? "" : "badge-warning"}`}
            data-testid="diagram-type-badge"
          >
            {diagramDefinitionLabel}
          </span>
          <span className="badge" data-testid="visual-mode-badge">
            {editorT("shell.metadata.visualMode", { mode: rendererLabel })}
          </span>
          <Link
            className="btn btn-link"
            href={`/create?fromProjectId=${project.id}`}
            data-testid="layout-policy-open-assistant-link"
          >
            {editorT("shell.metadata.changeInAssistant")}
          </Link>
          <span
            className={`badge ${isReapplyLayoutBlockedByPolicy ? "badge-warning" : ""}`}
            data-testid="layout-policy-badge"
          >
            {editorT("shell.metadata.layoutPolicy", { policy: layoutPolicyLabel })}
          </span>
          <button
            className="btn"
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            data-testid="editor-panel-metadata-toggle"
          >
            {isOpen
              ? `▾ ${editorT("shell.metadata.toggleOpen")}`
              : `▸ ${editorT("shell.metadata.toggleClosed", { count: nodeCount })}`}
          </button>
        </div>
      </header>
      {isOpen ? (
        <div className="panel-body">
          <div className="row-actions editor-toolbar editor-toolbar-meta">
            <span className="badge">
              <span className="badge-dot" aria-hidden="true" />
              {editorT("shell.metadata.workingSnapshot")}
            </span>
            <span className="muted">
              {editorT("shell.metadata.counts", {
                pendingCount,
                nodeCount,
                edgeCount,
              })}
            </span>
            {lastSavedAtLabel ? (
              <span className="muted">
                {editorT("shell.metadata.lastSavedAt", { time: lastSavedAtLabel })}
              </span>
            ) : null}
            <span className="helper">{saveMessage}</span>
            {isRefreshingFromQuery ? (
              <span className="helper">{editorT("shell.sync.syncing")}</span>
            ) : null}
            {querySyncMessage ? <span className="helper">{querySyncMessage}</span> : null}
          </div>

          <div className="row-actions editor-toolbar editor-toolbar-actions">
            <button
              className="btn"
              type="button"
              onClick={onRemoveSelected}
              disabled={isRemoveSelectedDisabled}
              data-testid="remove-selected-button"
            >
              {editorT("shell.buttons.removeSelected")}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={onManualSave}
              disabled={isManualSaveDisabled}
              data-testid="save-button"
            >
              {isSaving ? editorT("autosave.saving") : editorT("shell.buttons.save")}
            </button>
            <div className="field">
              <label className="sr-only" htmlFor="new-version-name-input">
                {editorT("shell.versions.newVersionNameAria")}
              </label>
              <input
                id="new-version-name-input"
                value={newVersionName}
                onChange={(event) => onNewVersionNameChange(event.target.value)}
                placeholder={editorT("shell.versions.newVersionNamePlaceholder")}
                aria-label={editorT("shell.versions.newVersionNameAria")}
              />
            </div>
            <button
              className="btn"
              type="button"
              onClick={onCreateVersion}
              disabled={isCreateVersionDisabled}
              data-testid="create-version-button"
            >
              {isCreatingVersion
                ? editorT("shell.versions.creating")
                : editorT("shell.versions.create")}
            </button>
            <button
              className="btn"
              type="button"
              onClick={onReapplyLayout}
              disabled={isReapplyLayoutDisabled}
              title={
                isReapplyLayoutBlockedByPolicy
                  ? editorT("shell.layoutPolicy.blockedTooltip")
                  : undefined
              }
              data-testid="reapply-layout-button"
            >
              {editorT("shell.buttons.reapplyLayout")}
            </button>
            {hasDiagramRendererMismatch ? (
              <span
                className="warning-text"
                data-testid="diagram-renderer-mismatch-warning"
              >
                {editorT("shell.metadata.rendererMismatch")}
              </span>
            ) : null}
            {isReapplyLayoutBlockedByPolicy ? (
              <>
                <span className="badge badge-warning">
                  {editorT("shell.layoutPolicy.blocked")}
                </span>
                <span className="helper">
                  {editorT("shell.layoutPolicy.blockedDescription")}
                </span>
              </>
            ) : null}
            {versionCreateFeedback ? (
              <span
                className="helper"
                aria-live="polite"
                role={versionCreateFeedback.kind === "error" ? "alert" : "status"}
                data-testid="create-version-feedback"
                data-feedback-kind={versionCreateFeedback.kind}
              >
                {versionCreateFeedback.message}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type EditorPrismaImportPanelProps = {
  editorT: EditorTranslationFn;
  isOpen: boolean;
  onToggle: () => void;
  onImport: () => void;
  isImportDisabled: boolean;
  isImporting: boolean;
  canImport: boolean;
  value: string;
  onValueChange: (value: string) => void;
  feedback: PrismaSchemaImportFeedback;
};

export function EditorPrismaImportPanel({
  editorT,
  isOpen,
  onToggle,
  onImport,
  isImportDisabled,
  isImporting,
  canImport,
  value,
  onValueChange,
  feedback,
}: EditorPrismaImportPanelProps) {
  return (
    <section
      className="panel editor-secondary-panel editor-panel-prisma"
      aria-label={editorT("shell.prisma.ariaLabel")}
    >
      <header className="panel-header">
        <div>
          <h3>{editorT("shell.prisma.title")}</h3>
          <p>{editorT("shell.prisma.description")}</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          data-testid="editor-panel-prisma-toggle"
        >
          {isOpen
            ? `▾ ${editorT("shell.prisma.toggleOpen")}`
            : `▸ ${editorT("shell.prisma.toggleClosed")}`}
        </button>
      </header>
      {isOpen ? (
        <div className="panel-body stack-sm" data-testid="prisma-schema-import-panel">
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={onImport}
              disabled={isImportDisabled || !canImport}
              data-testid="prisma-schema-import-button"
            >
              {isImporting
                ? editorT("shell.prisma.importing")
                : editorT("shell.prisma.import")}
            </button>
            <span className="helper">{editorT("shell.prisma.overwriteWarning")}</span>
          </div>

          <textarea
            className="mono"
            rows={8}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={`model User {\n  id String @id\n  posts Post[]\n}\n\nmodel Post {\n  id String @id\n  author User?\n}`}
            data-testid="prisma-schema-import-textarea"
          />

          {feedback ? (
            <div
              className="helper"
              role={feedback.kind === "error" ? "alert" : "status"}
              data-testid="prisma-schema-import-feedback"
              data-feedback-kind={feedback.kind}
            >
              {feedback.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type EditorVersionsPanelProps = {
  editorT: EditorTranslationFn;
  locale: string;
  isOpen: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isSaving: boolean;
  isCreatingVersion: boolean;
  activeVersionCompareId: string | null;
  activeVersionRestoreId: string | null;
  versionActionFeedback: VersionActionFeedback;
  versionDiffFeedback: VersionDiffFeedback;
  versionDiffSummary: VersionDiffSummaryResult | null;
  snapshotVersions: EditorSnapshotVersionSummary[];
  versionNameDrafts: Record<string, string>;
  onVersionNameDraftChange: (versionId: string, value: string) => void;
  onSaveVersionName: (versionId: string) => void;
  onCompareVersion: (versionId: string) => void;
  onRestoreVersion: (version: EditorSnapshotVersionSummary) => void;
  getVersionDisplayName: (version: EditorSnapshotVersionSummary) => string;
};

export function EditorVersionsPanel({
  editorT,
  locale,
  isOpen,
  onToggle,
  onRefresh,
  isRefreshing,
  isSaving,
  isCreatingVersion,
  activeVersionCompareId,
  activeVersionRestoreId,
  versionActionFeedback,
  versionDiffFeedback,
  versionDiffSummary,
  snapshotVersions,
  versionNameDrafts,
  onVersionNameDraftChange,
  onSaveVersionName,
  onCompareVersion,
  onRestoreVersion,
  getVersionDisplayName,
}: EditorVersionsPanelProps) {
  return (
    <section
      className="panel editor-secondary-panel editor-panel-versions"
      aria-label={editorT("shell.versions.ariaLabel")}
      id="versoes"
    >
      <header className="panel-header">
        <div>
          <h3>{editorT("shell.versions.title")}</h3>
          <p>{editorT("shell.versions.description")}</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          data-testid="editor-panel-versions-toggle"
        >
          {isOpen
            ? `▾ ${editorT("shell.versions.toggleOpen")}`
            : `▸ ${editorT("shell.versions.toggleClosed", {
                count: snapshotVersions.length,
              })}`}
        </button>
      </header>
      {isOpen ? (
        <div className="panel-body stack-sm">
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing || isSaving || activeVersionRestoreId !== null}
              data-testid="version-list-refresh-button"
            >
              {isRefreshing
                ? editorT("shell.versions.refreshing")
                : editorT("shell.versions.refresh")}
            </button>
            <span className="helper">{editorT("shell.versions.localNameHint")}</span>
          </div>

          {versionActionFeedback ? (
            <div
              className="helper"
              role={versionActionFeedback.kind === "error" ? "alert" : "status"}
              data-testid="version-action-feedback"
              data-feedback-kind={versionActionFeedback.kind}
            >
              {versionActionFeedback.message}
            </div>
          ) : null}

          {versionDiffFeedback ? (
            <div
              className="helper"
              role={versionDiffFeedback.kind === "error" ? "alert" : "status"}
              data-testid="version-diff-feedback"
              data-feedback-kind={versionDiffFeedback.kind}
            >
              {versionDiffFeedback.message}
            </div>
          ) : null}

          {versionDiffSummary ? (
            <section
              className="version-diff-executive"
              data-testid="version-diff-executive-summary"
            >
              <h4>{editorT("shell.versions.summaryTitle")}</h4>
              <div className="version-diff-cards">
                <article
                  className="version-diff-card"
                  data-testid="version-diff-card-nodes-added"
                >
                  <span>{editorT("shell.versions.cards.nodesAdded")}</span>
                  <strong>{versionDiffSummary.cards.nodesAdded}</strong>
                </article>
                <article
                  className="version-diff-card"
                  data-testid="version-diff-card-nodes-removed"
                >
                  <span>{editorT("shell.versions.cards.nodesRemoved")}</span>
                  <strong>{versionDiffSummary.cards.nodesRemoved}</strong>
                </article>
                <article
                  className="version-diff-card"
                  data-testid="version-diff-card-nodes-changed"
                >
                  <span>{editorT("shell.versions.cards.nodesChanged")}</span>
                  <strong>{versionDiffSummary.cards.nodesChanged}</strong>
                </article>
                <article
                  className="version-diff-card"
                  data-testid="version-diff-card-edges-changed"
                >
                  <span>{editorT("shell.versions.cards.edgesChanged")}</span>
                  <strong>{versionDiffSummary.cards.edgesChanged}</strong>
                </article>
              </div>
              <p className="helper">
                {editorT("shell.versions.changedBreakdown", {
                  renamed: versionDiffSummary.changedBreakdown.renamed,
                  kindChanged: versionDiffSummary.changedBreakdown.kindChanged,
                  payloadChanged: versionDiffSummary.changedBreakdown.payloadChanged,
                })}
              </p>
              <h5>{editorT("shell.versions.topChangesTitle")}</h5>
              <ul className="summary-list" data-testid="version-diff-top-changes">
                {versionDiffSummary.topChanges.map((entry, index) => (
                  <li key={`${entry}-${index}`}>{entry}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="stack-sm" data-testid="version-list">
            {snapshotVersions.length === 0 ? (
              <div className="helper">{editorT("shell.versions.empty")}</div>
            ) : (
              snapshotVersions.map((version) => (
                <div
                  key={version.id}
                  className="tile"
                  data-testid={`version-item-${version.id}`}
                >
                  <div className="row-actions row-actions-between">
                    <span className="badge">{getVersionDisplayName(version)}</span>
                    <span className="badge">
                      {editorT("shell.versions.originLabel", {
                        origin: formatVersionOriginLabel(version.origin, editorT),
                      })}
                    </span>
                    <span className="muted">
                      {formatVersionCreatedAtLabel(version.createdAt, locale)}
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor={`version-name-input-${version.id}`}>
                      {editorT("shell.versions.localNameLabel")}
                    </label>
                    <div className="row-actions">
                      <input
                        id={`version-name-input-${version.id}`}
                        value={versionNameDrafts[version.id] ?? ""}
                        onChange={(event) =>
                          onVersionNameDraftChange(version.id, event.target.value)
                        }
                        placeholder={editorT("shell.versions.localNamePlaceholder")}
                        data-testid={`version-name-input-${version.id}`}
                      />
                      <button
                        className="btn"
                        type="button"
                        onClick={() => onSaveVersionName(version.id)}
                        disabled={isSaving}
                        data-testid={`version-save-name-button-${version.id}`}
                      >
                        {editorT("shell.versions.saveName")}
                      </button>
                    </div>
                    <span className="helper">
                      {editorT("shell.versions.localNameDescription")}
                    </span>
                  </div>

                  <div className="row-actions">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => onCompareVersion(version.id)}
                      disabled={
                        isSaving ||
                        activeVersionRestoreId !== null ||
                        activeVersionCompareId !== null
                      }
                      data-testid={`version-compare-button-${version.id}`}
                    >
                      {activeVersionCompareId === version.id
                        ? editorT("shell.versions.comparing")
                        : editorT("shell.versions.compare")}
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => onRestoreVersion(version)}
                      disabled={
                        isSaving || isCreatingVersion || activeVersionRestoreId !== null
                      }
                      data-testid={`version-restore-button-${version.id}`}
                    >
                      {activeVersionRestoreId === version.id
                        ? editorT("shell.versions.restoring")
                        : editorT("shell.versions.restore")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
