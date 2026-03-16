type StepperItem = {
  id: string;
  index: number;
  title: string;
  description: string;
  state: "complete" | "current" | "available" | "pending";
  disabled?: boolean;
  onSelect: () => void;
};

type StepperProps = {
  items: StepperItem[];
  ariaLabel: string;
};

export function Stepper({ items, ariaLabel }: StepperProps) {
  return (
    <ol className="stepper-list" aria-label={ariaLabel}>
      {items.map((step) => (
        <li
          key={step.id}
          className="step-item"
          data-state={step.state}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="step-index">{step.index}</span>
          <div>
            <div className="step-title">{step.title}</div>
            <div className="step-description">{step.description}</div>
          </div>
          <button
            className="btn"
            type="button"
            disabled={step.disabled}
            onClick={step.onSelect}
            aria-label={
              step.state === "current"
                ? `Passo atual: ${step.title}`
                : `Ir para passo: ${step.title}`
            }
          >
            {step.state === "current" ? "Atual" : "Ir para passo"}
          </button>
        </li>
      ))}
    </ol>
  );
}
