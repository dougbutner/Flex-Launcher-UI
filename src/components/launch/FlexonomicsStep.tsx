import { useState } from "react";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { taxFromDraft, taxStepValid } from "@/components/launch/draftPlan";
import { RainDefaultsFields } from "@/components/launch/RainDefaultsFields";
import { TaxBucketsForm } from "@/components/launch/TaxBucketsForm";
import { InfoBody, InfoLink, StepShell } from "@/components/launch/ui";
import { FLEXONOMICS_GUIDE_PARAS } from "@/content/launchGuide";

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
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <StepShell
      title="Flexonomics"
      desc="Pick the transfer tax. for3x can also split the reflection slice into angel / jackpot. Set reflection minimums here."
      titleAside={<InfoLink open={infoOpen} onToggle={() => setInfoOpen((v) => !v)} />}
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
      <InfoBody open={infoOpen} paras={FLEXONOMICS_GUIDE_PARAS} />
      {locked ? (
        <p className="text-xs text-warning">
          Create already landed. Tax, ticker, and rain defaults are frozen here so execute preflight stays honest.
          Adjust tax later in Dev Tools with setfees. Rain floors stay in Dev Tools or Admin.
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
      <RainDefaultsFields
        value={{ rainMinHold: draft.rainMinHold, rainMinPool: draft.rainMinPool }}
        precision={draft.precision}
        symbol={draft.symbol}
        disabled={locked}
        onChange={(next) => patch({ rainMinHold: next.rainMinHold, rainMinPool: next.rainMinPool })}
      />
    </StepShell>
  );
}
