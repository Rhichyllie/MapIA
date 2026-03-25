import type { ReactNode } from "react";

type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  dataTestId?: string;
  className?: string;
};

export function EmptyState({
  eyebrow,
  title,
  description,
  actions,
  dataTestId,
  className,
}: EmptyStateProps) {
  return (
    <div className={`tile empty-state ${className ?? ""}`.trim()} data-testid={dataTestId}>
      {eyebrow ? <span className="empty-state-eyebrow">{eyebrow}</span> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {actions ? <div className="row-actions empty-state-actions">{actions}</div> : null}
    </div>
  );
}
