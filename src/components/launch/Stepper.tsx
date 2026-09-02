import { StatusIcon } from "@/components/launch/ui";

export type WizardStep = {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  locked: boolean;
};

export function Stepper(props: {
  steps: WizardStep[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="space-y-1">
      {props.steps.map((step, i) => {
        const active = i === props.current;
        return (
          <li key={step.id}>
            <button
              type="button"
              disabled={step.locked && !step.done}
              onClick={() => props.onSelect(i)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active
                  ? "bg-primary/15 text-foreground"
                  : step.locked && !step.done
                    ? "cursor-not-allowed opacity-40"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <StatusIcon state={step.done ? "done" : active ? "active" : "todo"} />
              <span className="min-w-0">
                <span className={`block truncate text-sm font-semibold ${active ? "text-primary" : ""}`}>
                  {step.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{step.desc}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
