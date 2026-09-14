import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { taxFromDraft, taxStepValid } from "@/components/launch/draftPlan";
import { TaxBucketsForm } from "@/components/launch/TaxBucketsForm";
import { StepShell } from "@/components/launch/ui";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
  locked?: boolean;
};

export function FlexonomicsStep({ draft, patch, onNext, onBack, locked = false }: Props) {
  const tax = taxFromDraft(draft);
  const invalid = taxStepValid(draft);

  return (
    <StepShell
      title="Flexonomics"
      desc="Pick the transfer tax. for3x can also split the reflection slice into angel / jackpot."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={Boolean(invalid)} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      {locked ? (
        <p className="text-xs text-warning">
          Create already landed. Tax and ticker are frozen here so execute preflight stays honest. Adjust later in
          Manager with setfees.
        </p>
      ) : null}
      <TaxBucketsForm
        program={draft.program}
        value={tax}
        disabled={locked}
        onChange={(next) =>
          patch({
            reflectionRate: next.reflectionRate,
            burnRate: next.burnRate,
            projectRate: next.projectRate,
            projectAccount: next.projectAccount,
            angelNumbersBps: next.angelNumbersBps,
            jackpotBps: next.jackpotBps,
          })
        }
      />
    </StepShell>
  );
}
