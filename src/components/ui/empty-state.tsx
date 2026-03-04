import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  dataTestId?: string;
};

export function EmptyState({
  title,
  description,
  actions,
  dataTestId,
}: EmptyStateProps) {
  return (
    <div className="tile" data-testid={dataTestId}>
      <h3>{title}</h3>
      <p>{description}</p>
      {actions ? <div className="row-actions">{actions}</div> : null}
    </div>
  );
}
