import { useTranslations } from "next-intl";

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
  dataTestId?: string;
};

export function Stepper({ items, ariaLabel, dataTestId }: StepperProps) {
  const t = useTranslations("Common.stepper");

  return (
    <ol
      className="stepper-list"
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
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
                ? t("currentStepAria", { title: step.title })
                : t("goToStepAria", { title: step.title })
            }
          >
            {step.state === "current"
              ? t("currentStepButton")
              : t("goToStepButton")}
          </button>
        </li>
      ))}
    </ol>
  );
}
