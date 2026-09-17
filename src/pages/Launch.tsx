import { useEffect, useMemo, useState } from "react";
import { easyHoldFull, easyHoldNeed, flexAccount, flexMeta, FLEX_QUOTE_HOLD_LABEL, holdEasyToLaunch } from "@/config/launch";
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
import { hasProjectTax } from "@/services/taxRates";

const EXECUTE_STEP = 5;

export default function Launch() {
  const { draft, patch, reset } = useLaunchDraft();
  const { isLoggedIn, actor } = useWallet();
  const [step, setStep] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const tokenOk = !tokenStepValid(draft);
  const taxOk = !taxStepValid(draft);
  const started = Boolean(draft.createTx);

  useEffect(() => {
    if (started || !actor || !hasProjectTax(draft.program) || draft.projectAccount.trim()) return;
    patch({ projectAccount: actor });
  }, [actor, started, draft.program, draft.projectAccount, patch]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(MANAGER_RESUME_KEY) !== "1") return;
      if (!draft.createTx || draft.addpoolTx) return;
      sessionStorage.removeItem(MANAGER_RESUME_KEY);
      setStep(EXECUTE_STEP);
    } catch {
      /* ignore */
    }
  }, [draft.createTx, draft.addpoolTx]);

  useEffect(() => {
    if (draft.addpoolTx) setCelebrate(true);
  }, [draft.addpoolTx]);

  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: "token",
        title: "Token",
        desc: "Name, ticker, supply, logo",
        done: tokenOk,
        locked: false,
      },
      {
        id: "flexonomics",
        title: "Flexonomics",
        desc: "Transfer tax and budgets",
        done: taxOk,
        locked: !tokenOk,
      },
      {
        id: "quote",
        title: "Paired token",
        desc: "Backing token",
        done: !quoteStepValid(draft) && tokenOk,
        locked: !tokenOk,
      },
      {
        id: "range",
        title: "Price Range & lock",
        desc: "Set price, see impact",
        done: !rangeStepValid(draft),
        locked: !tokenOk,
      },
      {
        id: "review",
        title: "Final Review",
        desc: "Check everything",
        done: false,
        locked: !tokenOk,
      },
      {
        id: "execute",
        title: "Execute",
        desc: "Press the big red button.",
        done: Boolean(draft.addpoolTx),
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
          Deploy a <span className="text-primary">Flex token</span> (flexible rewards)
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Only on <span className="font-mono">XPR Network</span>. Create on {flexAccount(draft.program)}, then setfees,
          seed one-sided Alcor liquidity, then liftoff. Non-flex backings (XPR / XMD / LOAN / xtoken) need to prove
          enough liquidity to be used. Flex pairs ({FLEX_QUOTE_HOLD_LABEL}):{" "}
          {holdEasyToLaunch(easyHoldNeed(flexMeta(draft.program).launchEasyMin))}. Other pairs:{" "}
          {holdEasyToLaunch(easyHoldFull(flexMeta(draft.program).launchEasyMin))}. No fee charged to launch, just gated
          by holding EASY.
        </p>
      </div>

      {!isLoggedIn ? (
        <div className="card mb-6 flex flex-wrap items-center gap-3 border-primary/30 bg-primary/5 p-4 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span>Connect Wallet (top right).</span>
        </div>
      ) : null}

      {started ? (
        <p className="mb-4 text-xs text-warning">
          Created on chain. Token created is frozen until the liquidity is locked, and you can adjust some parameters
          later in Manager, some fees can change, but not in a way that may hurt holders.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-var(--tetra-bar-h)-var(--tetra-footer-h)-24px)] lg:overflow-y-auto">
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

      {celebrate && draft.addpoolTx ? <LiftoffModal draft={draft} onReset={dismissLiftoff} /> : null}
    </div>
  );
}
