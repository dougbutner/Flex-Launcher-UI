import { useEffect, useMemo, useState } from "react";
import { SWAP_ALCOR, allFlexAccounts, easyHoldNeed, flexAccount, flexMeta, holdEasyToLaunch } from "@/config/launch";
import { MANAGER_RESUME_KEY, useLaunchDraft } from "@/hooks/useLaunchDraft";
import { useWallet } from "@/hooks/useWallet";
import { Stepper, type WizardStep } from "@/components/launch/Stepper";
import { TokenDetailsStep } from "@/components/launch/TokenDetailsStep";
import { FlexonomicsStep } from "@/components/launch/FlexonomicsStep";
import { QuoteStep } from "@/components/launch/QuoteStep";
import { RangeStep } from "@/components/launch/RangeStep";
import { ReviewStep } from "@/components/launch/ReviewStep";
import { ExecuteStep } from "@/components/launch/ExecuteStep";
import { LiftoffModal } from "@/components/launch/LiftoffModal";
import { LaunchPreview } from "@/components/launch/LaunchPreview";
import { EasyHoldNotice } from "@/components/launch/EasyHoldNotice";
import { quoteStepValid, rangeStepValid, taxStepValid, tokenStepValid } from "@/components/launch/draftPlan";
import { readChainStatus, type ChainStatus } from "@/services/chainStatus";

const EXECUTE_STEP = 5;

export default function Launch() {
  const { draft, patch, reset } = useLaunchDraft();
  const { isLoggedIn } = useWallet();
  const [step, setStep] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const tokenOk = !tokenStepValid(draft);
  const taxOk = !taxStepValid(draft);
  const started = Boolean(draft.createTx);
  const [chain, setChain] = useState<ChainStatus | null>(null);

  useEffect(() => {
    void readChainStatus().then(setChain).catch(() => setChain(null));
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(MANAGER_RESUME_KEY) !== "1") return;
      if (!draft.createTx || draft.liftoffTx) return;
      sessionStorage.removeItem(MANAGER_RESUME_KEY);
      setStep(EXECUTE_STEP);
    } catch {
      /* ignore */
    }
  }, [draft.createTx, draft.liftoffTx]);

  useEffect(() => {
    if (draft.liftoffTx) setCelebrate(true);
  }, [draft.liftoffTx]);

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
        id: "flexonomics",
        title: "Flexonomics",
        desc: "Transfer tax and channels",
        done: taxOk,
        locked: !tokenOk,
      },
      {
        id: "quote",
        title: "Quote pair",
        desc: "Backing market",
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
        locked: !tokenOk || !taxOk,
      },
    ],
    [draft, tokenOk, taxOk]
  );

  const dismissLiftoff = () => {
    setCelebrate(false);
    reset();
    setStep(0);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">
          Deploy a <span className="text-primary">flex token</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Signing against <span className="font-mono">XPR Network</span>. Create on {flexAccount(draft.program)}, then
          setfees, seed one-sided Alcor liquidity, then liftoff. Non-flex quotes (XPR / XMD / LOAN / xtoken) need a
          proof pool id &gt; 0. {holdEasyToLaunch(easyHoldNeed(flexMeta(draft.program).launchEasyMin))} - that balance
          is read from <span className="font-mono">mon3y</span>.
        </p>
      </div>

      {chain ? (
        <div className="card mb-6 space-y-1 p-4 text-xs">
          <p className="font-semibold">
            {chain.contracts.flexforex && chain.contracts.easyflex && chain.contracts.complexflex && chain.contracts.swap
              ? `${allFlexAccounts().join(", ")}, and ${SWAP_ALCOR} are live on XPR Network.`
              : "One or more flex / Alcor accounts are missing - check VITE_* env."}
          </p>
          {!chain.lockpos ? (
            <p className="text-warning">
              swap.alcor has no lockpos. Liftoff still requires a 90-day Alcor lock, so the last step will fail until
              that action exists on chain.
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
          <span>Connect WebAuth or Anchor (top right).</span>
        </div>
      ) : null}

      {started ? (
        <p className="mb-4 text-xs text-warning">
          Create is on chain. Token, Flexonomics, quote, and range are frozen so execute preflight cannot drift. Finish
          liftoff, then use Manager for later setfees.
        </p>
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
            <FlexonomicsStep
              draft={draft}
              patch={patch}
              locked={started}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          ) : step === 2 ? (
            <QuoteStep draft={draft} patch={patch} locked={started} onNext={() => setStep(3)} onBack={() => setStep(1)} />
          ) : step === 3 ? (
            <RangeStep draft={draft} patch={patch} locked={started} onNext={() => setStep(4)} onBack={() => setStep(2)} />
          ) : step === 4 ? (
            <ReviewStep draft={draft} onNext={() => setStep(5)} onBack={() => setStep(3)} />
          ) : (
            <>
              <ExecuteStep draft={draft} patch={patch} onBack={() => setStep(4)} onDone={() => setCelebrate(true)} />
              <EasyHoldNotice active />
            </>
          )}
        </div>

        <div className="order-3">
          <LaunchPreview draft={draft} patch={started ? undefined : patch} />
        </div>
      </div>

      {celebrate && draft.liftoffTx ? <LiftoffModal draft={draft} onReset={dismissLiftoff} /> : null}
    </div>
  );
}
