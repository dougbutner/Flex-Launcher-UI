import { useMemo, useState } from "react";
import { flexAccount } from "@/config/launch";
import { useLaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { Stepper, type WizardStep } from "@/components/launch/Stepper";
import { TokenDetailsStep } from "@/components/launch/TokenDetailsStep";
import { RamStep } from "@/components/launch/RamStep";
import { QuoteStep } from "@/components/launch/QuoteStep";
import { RangeStep } from "@/components/launch/RangeStep";
import { ReviewStep } from "@/components/launch/ReviewStep";
import { ExecuteStep } from "@/components/launch/ExecuteStep";
import { DonePanel } from "@/components/launch/DonePanel";
import { LaunchPreview } from "@/components/launch/LaunchPreview";
import { quoteStepValid, rangeStepValid, tokenStepValid } from "@/components/launch/draftPlan";

export default function Launch() {
  const { draft, patch, reset } = useLaunchDraft();
  const { isLoggedIn } = useWallet();
  const [step, setStep] = useState(0);

  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: "token",
        title: "Token",
        desc: "Name, ticker, supply, art",
        done: !tokenStepValid(draft),
        locked: false,
      },
      {
        id: "ram",
        title: "Contract RAM",
        desc: `5,000 XPR gift to ${flexAccount(draft.program)}`,
        done: Boolean(draft.ramTx),
        locked: Boolean(tokenStepValid(draft)),
      },
      {
        id: "quote",
        title: "Quote pair",
        desc: "EASY, WON, GRAMS, MEME, xtoken",
        done: !quoteStepValid(draft) && Boolean(draft.ramTx),
        locked: !draft.ramTx,
      },
      {
        id: "range",
        title: "Range & lock",
        desc: "One-sided curve, 90d+ lock",
        done: !rangeStepValid(draft),
        locked: !draft.ramTx,
      },
      {
        id: "review",
        title: "Review",
        desc: "Ticks, pair order, skim",
        done: false,
        locked: !draft.ramTx,
      },
      {
        id: "execute",
        title: "Execute",
        desc: "Sign the launch transactions",
        done: Boolean(draft.liftoffTx),
        locked: !draft.ramTx,
      },
    ],
    [draft]
  );

  if (draft.liftoffTx) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <DonePanel draft={draft} onReset={() => { reset(); setStep(0); }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">
          Deploy a <span className="text-primary">flex token</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Create on {flexAccount(draft.program)}, seed a one-sided Alcor pool with 100% of supply, lock it ≥ 90 days, and
          liftoff so it is transferable. The first on-chain step is a 5,000 XPR RAM gift to the chosen contract.
        </p>
      </div>

      {!isLoggedIn ? (
        <div className="card mb-6 flex items-center gap-3 border-primary/30 bg-primary/5 p-4 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Connect WebAuth or Anchor (top right) to sign the launch steps. Your draft persists locally.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <div className="lg:sticky lg:top-20">
            <Stepper steps={steps} current={step} onSelect={setStep} />
          </div>
        </div>

        <div className="order-1 lg:order-2">
          {step === 0 ? (
            <TokenDetailsStep draft={draft} patch={patch} onNext={() => setStep(1)} />
          ) : step === 1 ? (
            <RamStep draft={draft} patch={patch} onNext={() => setStep(2)} onBack={() => setStep(0)} />
          ) : step === 2 ? (
            <QuoteStep draft={draft} patch={patch} onNext={() => setStep(3)} onBack={() => setStep(1)} />
          ) : step === 3 ? (
            <RangeStep draft={draft} patch={patch} onNext={() => setStep(4)} onBack={() => setStep(2)} />
          ) : step === 4 ? (
            <ReviewStep draft={draft} onNext={() => setStep(5)} onBack={() => setStep(3)} />
          ) : (
            <ExecuteStep draft={draft} patch={patch} onBack={() => setStep(4)} onDone={() => {}} />
          )}
        </div>

        <div className="order-3">
          <LaunchPreview draft={draft} />
        </div>
      </div>
    </div>
  );
}
