import { useEffect, useState } from "react";
import { QUOTE_PRESETS, type QuotePreset } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { quoteStepValid } from "@/components/launch/draftPlan";
import { Field, StepShell } from "@/components/launch/ui";
import { xtokenProofOk } from "@/services/flexTables";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
};

function QuoteCard({
  preset,
  selected,
  onSelect,
}: {
  preset: QuotePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition-all ${
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.8)]"
          : "border-input bg-background/50 hover:border-primary/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-base font-bold">{preset.label}</span>
        {preset.flexQuote ? <span className="chip-success">0% skim</span> : <span className="chip-warn">0.5% skim</span>}
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">@{preset.contract}</div>
      <div className="mt-2 text-xs text-muted-foreground">
        Cap: {preset.priceLower} – {preset.priceUpper} {preset.symbol} / token
      </div>
    </button>
  );
}

export function QuoteStep({ draft, patch, onNext, onBack }: Props) {
  const [proof, setProof] = useState<{ ok: boolean; reason: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const invalid = quoteStepValid(draft);
  const isXtoken = draft.quoteId === "xtoken";

  useEffect(() => {
    if (!isXtoken || invalid) {
      setProof(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = window.setTimeout(() => {
      xtokenProofOk(Number(draft.proofPoolId), draft.xtokenSymbol.trim().toUpperCase())
        .then((r) => {
          if (!cancelled) setProof(r);
        })
        .catch(() => {
          if (!cancelled) setProof({ ok: false, reason: "Could not verify proof pool." });
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [isXtoken, invalid, draft.proofPoolId, draft.xtokenSymbol]);

  const blocked = Boolean(invalid) || (isXtoken && !proof?.ok);

  return (
    <StepShell
      title="Pick the quote"
      desc="What buyers pay in. Flex quotes keep reflections at 0% protocol skim; xtoken quotes skim 0.25% to nyra + 0.25% to reflections."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={blocked} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUOTE_PRESETS.map((preset) => (
          <QuoteCard
            key={preset.id}
            preset={preset}
            selected={draft.quoteId === preset.id}
            onSelect={() =>
              patch({
                quoteId: preset.id,
                priceLower: preset.priceLower,
                priceUpper: preset.priceUpper,
              })
            }
          />
        ))}
      </div>

      {isXtoken ? (
        <div className="space-y-4 rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-xs text-warning">
            xtoken quotes need an existing Alcor pool pairing the xtoken with XUSDC or XPR, with ≥ 10 XUSDC or ≥
            1,000 XPR of inventory on swap.alcor.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="xtoken symbol">
              <input
                className="input font-mono uppercase"
                value={draft.xtokenSymbol}
                maxLength={7}
                onChange={(e) => patch({ xtokenSymbol: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
              />
            </Field>
            <Field label="Precision">
              <input
                className="input font-mono"
                inputMode="numeric"
                value={draft.xtokenPrecision}
                onChange={(e) =>
                  patch({ xtokenPrecision: Math.max(0, Math.min(8, Number(e.target.value.replace(/\D/g, "") || 0))) })
                }
              />
            </Field>
            <Field label="Proof pool id">
              <input
                className="input font-mono"
                inputMode="numeric"
                placeholder="e.g. 2142"
                value={draft.proofPoolId}
                onChange={(e) => patch({ proofPoolId: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </div>
          {checking ? (
            <p className="text-xs text-muted-foreground">Verifying proof pool…</p>
          ) : proof ? (
            <p className={`text-xs font-medium ${proof.ok ? "text-success" : "text-destructive"}`}>{proof.reason}</p>
          ) : invalid ? (
            <p className="text-xs font-medium text-warning">{invalid}</p>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}
