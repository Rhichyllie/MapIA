import type { ReactNode } from "react";
import type { SemanticIssueLike } from "./editor-shell-types";

type EditorSemanticAuditPanelProps = {
  ariaLabel: string;
  title: string;
  summaryLabel: string;
  applyAllSafeFixesLabel?: string;
  onApplyAllSafeFixes?: () => void;
  isOpen: boolean;
  safeFixPreviewItems?: string[];
  issues: SemanticIssueLike[];
  emptyLabel: string;
  collapsedHint: string;
  renderSeverityLabel: (severity: SemanticIssueLike["severity"]) => string;
  renderIssueActions: (issue: SemanticIssueLike, index: number) => ReactNode;
};

export function EditorSemanticAuditPanel({
  ariaLabel,
  title,
  summaryLabel,
  applyAllSafeFixesLabel,
  onApplyAllSafeFixes,
  isOpen,
  safeFixPreviewItems = [],
  issues,
  emptyLabel,
  collapsedHint,
  renderSeverityLabel,
  renderIssueActions,
}: EditorSemanticAuditPanelProps) {
  return (
    <section
      className={`semantic-audit-panel ${isOpen ? "is-open" : ""}`}
      aria-label={ariaLabel}
      data-testid="semantic-audit-panel"
    >
      <div className="row-actions semantic-audit-header">
        <strong>{title}</strong>
        <span className="badge">{summaryLabel}</span>
        {onApplyAllSafeFixes && applyAllSafeFixesLabel ? (
          <button
            className="btn"
            type="button"
            onClick={onApplyAllSafeFixes}
            data-testid="semantic-audit-apply-all-safe-fixes"
          >
            {applyAllSafeFixesLabel}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        issues.length > 0 ? (
          <>
            {safeFixPreviewItems.length > 0 ? (
              <ul className="summary-list semantic-safe-fix-preview">
                {safeFixPreviewItems.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            ) : null}
            <ul className="summary-list semantic-audit-list" data-testid="semantic-audit-issues">
              {issues.slice(0, 40).map((issue, index) => (
                <li
                  key={issue.id}
                  className={`semantic-audit-item semantic-audit-item-${issue.severity}`}
                  data-testid={`semantic-issue-item-${index}`}
                >
                  <div className="semantic-audit-item-main">
                    <strong>{renderSeverityLabel(issue.severity)}</strong>
                    <span>{issue.message}</span>
                    {issue.explanation ? (
                      <span className="helper">{issue.explanation}</span>
                    ) : null}
                  </div>
                  <div className="row-actions">{renderIssueActions(issue, index)}</div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="helper" data-testid="semantic-audit-empty">
            {emptyLabel}
          </p>
        )
      ) : (
        <p className="helper">{collapsedHint}</p>
      )}
    </section>
  );
}
