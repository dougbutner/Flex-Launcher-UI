import { useEffect, useState } from "react";
import { quoteNeedsProof, QUOTE_PRESETS, type QuotePreset } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { presetFromDraft, quoteFromDraft, quoteStepValid } from "@/components/launch/draftPlan";
import { Field, StepShell } from "@/components/launch/ui";
import { quoteProofOk } from "@/services/flexTables";
import { getAccount } from "@/services/rpc";

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
  unavailable,
}: {
  preset: QuotePreset;
  selected: boolean;
  onSelect: () => void;
  unavailable?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left transition-all ${
        unavailable
          ? "cursor-not-allowed opacity-50"
          : selected
            ? "border-primary bg-primary/10 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.8)]"
            : "border-input bg-background/50 hover:border-primary/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-base font-bold">{preset.label}</span>
        {unavailable ? (
          <span className="chip-muted">not on testnet</span>
        ) : preset.flexQuote ? (
          <span className="chip-success">0% skim</span>
        ) : (
          <span className="chip-warn">0.5% skim</span>
        )}
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">@{preset.contract}</div>
      <div className="mt-2 text-xs text-muted-foreground">
        Cap: {preset.priceLower} - {preset.priceUpper} {preset.symbol} / token
      </div>
    </button>
  );
}

export function QuoteStep({ draft, patch, onNext, onBack }: Props) {
  const [proof, setProof] = useState<{ ok: boolean; reason: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [live, setLive] = useState<Record<string, boolean>>({});
  const invalid = quoteStepValid(draft);
  const preset = presetFromDraft(draft);
  const needsProof = quoteNeedsProof(preset);
  const isXtoken = draft.quoteId === "xtoken";
  const quote = quoteFromDraft(draft);

  useEffect(() => {
    const contracts = [...new Set(QUOTE_PRESETS.map((p) => p.contract))];
    void Promise.all(
      contracts.map(async (c) => {
        const ok = await getAccount(c)
          .then((a) => Boolean(a.account_name))
          .catch(() => false);
        return [c, ok] as const;
      })
    ).then((rows) => setLive(Object.fromEntries(rows)));
  }, []);

  useEffect(() => {
    if (!needsProof || invalid) {
      setProof(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = window.setTimeout(() => {
      quoteProofOk(Number(draft.proofPoolId), quote.symbol, quote.contract)
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
  }, [needsProof, invalid, draft.proofPoolId, quote.symbol, quote.contract]);

  const selected = QUOTE_PRESETS.find((p) => p.id === draft.quoteId);
  const quoteMissing = Boolean(selected && live[selected.contract] === false);
  const blocked = Boolean(invalid) || quoteMissing || (needsProof && !proof?.ok);

  return (
    <StepShell
      title="Pick the quote"
      desc="What buyers pay in. Flex quotes (EASY/WON/GRAMS/MEME) need no proof pool. XPR, XMD, LOAN, and xtokens need a non-zero Alcor proof pool vs XUSDC or XPR."
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
        {QUOTE_PRESETS.map((p) => {
          const unavailable = live[p.contract] === false;
          return (
            <QuoteCard
              key={p.id}
              preset={p}
              selected={draft.quoteId === p.id}
              unavailable={unavailable}
              onSelect={() =>
                patch({
                  quoteId: p.id,
                  priceLower: p.priceLower,
                  priceUpper: p.priceUpper,
                  rangeWidthId: null,
                  ...(p.id === "xtoken"
                    ? { xtokenSymbol: p.symbol, xtokenPrecision: p.precision, proofPoolId: draft.proofPoolId || "" }
                    : quoteNeedsProof(p)
                      ? { proofPoolId: draft.proofPoolId || "" }
                      : { proofPoolId: "0" }),
                })
              }
            />
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Skim chips are the liftoff starting rates. After the Alcor lock expires, checklock (or makeitrain) can add
        +0.25% each to nyra and reflections.
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.swapUnderlyingDefault}
          onChange={(e) => patch({ swapUnderlyingDefault: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-semibold">Reflect into the quote (underlying)</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            When on, makeitrain swaps holders who have not chosen a flex reward into {quote.symbol}@
            {quote.contract} through the launch Alcor pool. When off, they receive the native token.
          </span>
        </span>
      </label>

      {quoteMissing ? (
        <p className="text-xs text-warning">
          {selected?.symbol}@{selected?.contract} is not on this chain. Pick another quote.
        </p>
      ) : null}

      {needsProof ? (
        <div className="space-y-4 rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-xs text-warning">
            Non-flex quotes need an existing Alcor pool pairing the quote with XUSDC or XPR. Contract requires proof
            pool id &gt; 0 and ≥ 10 XUSDC or ≥ 1,000 XPR of valued inventory on swap.alcor.
          </p>
          <div className={`grid grid-cols-1 gap-4 ${isXtoken ? "sm:grid-cols-3" : "sm:grid-cols-1"}`}>
            {isXtoken ? (
              <>
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
                      patch({
                        xtokenPrecision: Math.max(0, Math.min(8, Number(e.target.value.replace(/\D/g, "") || 0))),
                      })
                    }
                  />
                </Field>
              </>
            ) : null}
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
