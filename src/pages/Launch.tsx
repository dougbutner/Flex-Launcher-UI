import { useEffect, useMemo, useState } from "react";
import { FAUCET_URL, flexAccount, flexMeta, holdEasyToLaunch } from "@/config/launch";
import { useLaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { Stepper, type WizardStep } from "@/components/launch/Stepper";
import { TokenDetailsStep } from "@/components/launch/TokenDetailsStep";
import { QuoteStep } from "@/components/launch/QuoteStep";
import { RangeStep } from "@/components/launch/RangeStep";
import { ReviewStep } from "@/components/launch/ReviewStep";
import { ExecuteStep } from "@/components/launch/ExecuteStep";
import { DonePanel } from "@/components/launch/DonePanel";
import { LaunchPreview } from "@/components/launch/LaunchPreview";
import { quoteStepValid, rangeStepValid, tokenStepValid } from "@/components/launch/draftPlan";
import { readChainStatus, type ChainStatus } from "@/services/chainStatus";

export default function Launch() {
  const { draft, patch, reset } = useLaunchDraft();
  const { isLoggedIn } = useWallet();
  const [step, setStep] = useState(0);
  const tokenOk = !tokenStepValid(draft);
  const [chain, setChain] = useState<ChainStatus | null>(null);

  useEffect(() => {
    void readChainStatus().then(setChain).catch(() => setChain(null));
  }, []);

  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: "token",
        title: "Token",
        desc: "Name, ticker, supply, art",
        done: tokenOk,
        locked: false,
      },
      {
        id: "quote",
        title: "Quote pair",
        desc: "xtoken proof pool",
        done: !quoteStepValid(draft) && tokenOk,
        locked: !tokenOk,
      },
      {
        id: "range",
        title: "Range & lock",
        desc: "One-sided Alcor range",
        done: !rangeStepValid(draft),
        locked: !tokenOk,
      },
      {
        id: "review",
        title: "Review",
        desc: "Ticks, pair order, skim",
        done: false,
        locked: !tokenOk,
      },
      {
        id: "execute",
        title: "Execute",
        desc: "Sign the launch transactions",
        done: Boolean(draft.liftoffTx),
        locked: !tokenOk,
      },
    ],
    [draft, tokenOk]
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
          Signing against <span className="font-mono">XPR testnet</span>. Create on {flexAccount(draft.program)}, seed
          one-sided Alcor liquidity, then liftoff. Quote with FOOBAR@xtokens (proof pool #0).{" "}
          {holdEasyToLaunch(flexMeta(draft.program).launchEasyMin)} — that balance is read from{" "}
          <span className="font-mono">mon3y</span>.
        </p>
      </div>

      {chain ? (
        <div className="card mb-6 space-y-1 p-4 text-xs">
          <p className="font-semibold">
            {chain.contracts.flexforex && chain.contracts.easyflex && chain.contracts.complexflex && chain.contracts.swap
              ? "flexforex, easyflex, complexflex, and swap.alcor are live on this chain."
              : "One or more flex / Alcor accounts are missing — check VITE_* env."}
          </p>
          {!chain.lockpos ? (
            <p className="text-warning">
              Testnet swap.alcor has no lockpos. Liftoff still requires a 90-day Alcor lock, so the last step will fail
              until that action exists on chain.
            </p>
          ) : null}
          {!chain.mon3y ? (
            <p className="text-warning">
              Account mon3y is not deployed, so the EASY hold check at liftoff cannot pass. Create / mint / startlaunch
              can still be signed.
            </p>
          ) : null}
        </div>
      ) : null}

      {!isLoggedIn ? (
        <div className="card mb-6 flex flex-wrap items-center gap-3 border-primary/30 bg-primary/5 p-4 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span>
            Connect WebAuth or Anchor (top right). Need testnet XPR?{" "}
            <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="link">
              Faucet
            </a>
            .
          </span>
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
            <QuoteStep draft={draft} patch={patch} onNext={() => setStep(2)} onBack={() => setStep(0)} />
          ) : step === 2 ? (
            <RangeStep draft={draft} patch={patch} onNext={() => setStep(3)} onBack={() => setStep(1)} />
          ) : step === 3 ? (
            <ReviewStep draft={draft} onNext={() => setStep(4)} onBack={() => setStep(2)} />
          ) : (
            <ExecuteStep draft={draft} patch={patch} onBack={() => setStep(3)} onDone={() => {}} />
          )}
        </div>

        <div className="order-3">
          <LaunchPreview draft={draft} />
        </div>
      </div>
    </div>
  );
}
