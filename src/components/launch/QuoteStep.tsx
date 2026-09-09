import { useEffect, useMemo, useState } from "react";
import { TokenIcon } from "@/components/TokenIcon";
import { quoteNeedsProof, QUOTE_PRESETS, XTOKENS, type QuotePreset } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { presetFromDraft, quoteFromDraft, quoteStepValid } from "@/components/launch/draftPlan";
import { Field, StepShell } from "@/components/launch/ui";
import { quoteProofOk } from "@/services/flexTables";
import { getAccount } from "@/services/rpc";
import {
  fetchXtokensByPopularity,
  findProofPoolId,
  XTOKEN_FALLBACK,
  XTOKEN_TOP_N,
  type XtokenRow,
} from "@/services/xtokenCatalog";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
};

const FLEX_IDS = new Set(["easy", "won", "grams", "meme"]);
const CHAIN_IDS = new Set(["xpr", "xmd", "loan"]);

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
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TokenIcon contract={preset.contract} symbol={preset.symbol} size={28} />
          <span className="font-mono text-base font-bold">{preset.label}</span>
        </span>
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

function fmtUsd(n: number): string {
  if (!(n > 0)) return "-";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(3)}`;
}

export function QuoteStep({ draft, patch, onNext, onBack }: Props) {
  const [proof, setProof] = useState<{ ok: boolean; reason: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [xtokens, setXtokens] = useState<XtokenRow[] | null>(null);
  const [xtokenErr, setXtokenErr] = useState("");
  const [xtokenLoading, setXtokenLoading] = useState(false);
  /** Picker open: show the xtoken grid. Closed after pick (or never opened). */
  const [xtokenPickerOpen, setXtokenPickerOpen] = useState(false);
  /** Show all rows vs top N. */
  const [xtokenShowAll, setXtokenShowAll] = useState(false);
  const [proofHint, setProofHint] = useState("");
  const [proofBusy, setProofBusy] = useState(false);

  const invalid = quoteStepValid(draft);
  const preset = presetFromDraft(draft);
  const needsProof = quoteNeedsProof(preset);
  const isXtoken = draft.quoteId === "xtoken";
  const quote = quoteFromDraft(draft);

  const flexPresets = useMemo(() => QUOTE_PRESETS.filter((p) => FLEX_IDS.has(p.id)), []);
  const chainPresets = useMemo(() => QUOTE_PRESETS.filter((p) => CHAIN_IDS.has(p.id)), []);
  const xtokenPreset = QUOTE_PRESETS.find((p) => p.id === "xtoken")!;

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

  const autofillProof = (symbol: string, contract: string) => {
    setProofBusy(true);
    setProofHint("Looking up Alcor proof pool…");
    void findProofPoolId(symbol, contract)
      .then((hit) => {
        if (!hit) {
          setProofHint("No active XUSDC/XPR pool found. Paste a proof pool id manually.");
          return;
        }
        patch({ proofPoolId: String(hit.poolId) });
        setProofHint(
          `Auto-filled pool #${hit.poolId} vs ${hit.against} (fee ${hit.fee / 10000}%, TVL ~$${hit.tvlUSD.toFixed(0)}).`
        );
      })
      .catch(() => setProofHint("Could not reach Alcor for proof pool. Paste an id manually."))
      .finally(() => setProofBusy(false));
  };

  const loadXtokens = () => {
    if (xtokens || xtokenLoading) return;
    setXtokenLoading(true);
    setXtokenErr("");
    void fetchXtokensByPopularity()
      .then((rows) => setXtokens(rows))
      .catch(() => {
        setXtokens(XTOKEN_FALLBACK);
        setXtokenErr("Live Alcor list unavailable. Showing curated popular xtokens.");
      })
      .finally(() => setXtokenLoading(false));
  };

  const openXtokenPicker = () => {
    patch({
      quoteId: "xtoken",
      priceLower: xtokenPreset.priceLower,
      priceUpper: xtokenPreset.priceUpper,
      rangeWidthId: null,
      proofPoolId: draft.proofPoolId || "",
    });
    setXtokenPickerOpen(true);
    setXtokenShowAll(false);
    loadXtokens();
  };

  const selectXtoken = (row: XtokenRow) => {
    patch({
      quoteId: "xtoken",
      xtokenSymbol: row.symbol,
      xtokenPrecision: row.precision,
      priceLower: xtokenPreset.priceLower,
      priceUpper: xtokenPreset.priceUpper,
      rangeWidthId: null,
      proofPoolId: draft.proofPoolId || "",
    });
    setXtokenPickerOpen(false);
    setXtokenShowAll(false);
    autofillProof(row.symbol, XTOKENS);
  };

  const selectPreset = (p: QuotePreset) => {
    setXtokenPickerOpen(false);
    setXtokenShowAll(false);
    patch({
      quoteId: p.id,
      priceLower: p.priceLower,
      priceUpper: p.priceUpper,
      rangeWidthId: null,
      ...(quoteNeedsProof(p) ? { proofPoolId: draft.proofPoolId || "" } : { proofPoolId: "0" }),
    });
    setProofHint("");
    if (quoteNeedsProof(p) && p.id !== "xtoken") {
      autofillProof(p.symbol, p.contract);
    }
  };

  const selected = QUOTE_PRESETS.find((p) => p.id === draft.quoteId);
  const quoteMissing = Boolean(selected && live[selected.contract] === false);
  const blocked = Boolean(invalid) || quoteMissing || (needsProof && !proof?.ok);

  const catalog = xtokens ?? [];
  const visibleDogs = xtokenShowAll ? catalog : catalog.slice(0, XTOKEN_TOP_N);
  const hasMore = catalog.length > XTOKEN_TOP_N;
  const selectedRow =
    catalog.find((r) => r.symbol === draft.xtokenSymbol) ??
    XTOKEN_FALLBACK.find((r) => r.symbol === draft.xtokenSymbol) ??
    null;

  return (
    <StepShell
      title="Pick the quote"
      desc="What buyers pay in. Flex quotes need no proof pool. XPR, XMD, LOAN, and xtokens need a non-zero Alcor proof pool vs XUSDC or XPR."
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
      <div>
        <p className="label">Flex quotes</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {flexPresets.map((p) => (
            <QuoteCard
              key={p.id}
              preset={p}
              selected={draft.quoteId === p.id}
              unavailable={live[p.contract] === false}
              onSelect={() => selectPreset(p)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="label">Chain quotes</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {chainPresets.map((p) => (
            <QuoteCard
              key={p.id}
              preset={p}
              selected={draft.quoteId === p.id}
              unavailable={live[p.contract] === false}
              onSelect={() => selectPreset(p)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="label">xtokens</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Bridged majors on xtokens (XBTC, XXRP, and friends). Top {XTOKEN_TOP_N} by Alcor market activity; expand for the
          full list. Logos are the on-chain token.proton icons, served from this app.
        </p>

        {/* Collapsed selection or category entry */}
        {!xtokenPickerOpen ? (
          <div className="space-y-2">
            {isXtoken && draft.xtokenSymbol ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary bg-primary/10 p-4">
                <TokenIcon contract={XTOKENS} symbol={draft.xtokenSymbol} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-lg font-bold">{draft.xtokenSymbol}</div>
                  <div className="text-xs text-muted-foreground">
                    @{xtokenPreset.contract} · {draft.xtokenPrecision} decimals · 0.5% skim
                    {selectedRow?.usdPrice ? ` · ${fmtUsd(selectedRow.usdPrice)}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="link text-sm"
                  onClick={() => {
                    setXtokenPickerOpen(true);
                    setXtokenShowAll(false);
                    loadXtokens();
                  }}
                >
                  expand
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openXtokenPicker}
                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                  live[xtokenPreset.contract] === false
                    ? "cursor-not-allowed opacity-50"
                    : "border-input bg-background/50 hover:border-primary/40"
                }`}
                disabled={live[xtokenPreset.contract] === false}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-bold">xtokens</span>
                  <span className="chip-warn">0.5% skim</span>
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">@{xtokenPreset.contract}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Click to load XBTC, XXRP, XETH, and the rest.
                </div>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-sm font-bold">Pick an xtoken</div>
                <div className="text-xs text-muted-foreground">
                  {xtokenLoading
                    ? "Fetching Alcor ranking…"
                    : `Showing ${visibleDogs.length} of ${catalog.length || "…"}`}
                </div>
              </div>
              {isXtoken && draft.xtokenSymbol ? (
                <button
                  type="button"
                  className="link text-sm"
                  onClick={() => {
                    setXtokenPickerOpen(false);
                    setXtokenShowAll(false);
                  }}
                >
                  collapse
                </button>
              ) : null}
            </div>

            {xtokenErr ? <p className="text-xs text-warning">{xtokenErr}</p> : null}

            {xtokenLoading && !catalog.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary/80" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {visibleDogs.map((row) => {
                  const selectedDog = isXtoken && draft.xtokenSymbol === row.symbol;
                  return (
                    <button
                      key={row.symbol}
                      type="button"
                      title={`${row.symbol} · ${fmtUsd(row.usdPrice)}`}
                      onClick={() => selectXtoken(row)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                        selectedDog
                          ? "border-primary bg-primary/15"
                          : "border-input bg-background/60 hover:border-primary/40"
                      }`}
                    >
                      <TokenIcon contract={XTOKENS} symbol={row.symbol} size={52} />
                      <span className="font-mono text-xs font-bold">{row.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">{fmtUsd(row.usdPrice)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {hasMore ? (
              <button
                type="button"
                className="link text-sm"
                onClick={() => setXtokenShowAll((v) => !v)}
              >
                {xtokenShowAll ? "show top 10" : "expand"}
              </button>
            ) : null}

            <Field label="Custom xtoken" hint="Not in the list? Type a symbol (1-7 A-Z).">
              <div className="flex flex-wrap gap-2">
                <input
                  className="input max-w-[10rem] font-mono uppercase"
                  value={draft.xtokenSymbol}
                  maxLength={7}
                  onChange={(e) =>
                    patch({
                      quoteId: "xtoken",
                      xtokenSymbol: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    })
                  }
                />
                <input
                  className="input w-20 font-mono"
                  inputMode="numeric"
                  title="Precision"
                  value={draft.xtokenPrecision}
                  onChange={(e) =>
                    patch({
                      xtokenPrecision: Math.max(0, Math.min(8, Number(e.target.value.replace(/\D/g, "") || 0))),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!draft.xtokenSymbol}
                  onClick={() => {
                    if (!draft.xtokenSymbol) return;
                    selectXtoken({
                      symbol: draft.xtokenSymbol,
                      precision: draft.xtokenPrecision,
                      usdPrice: 0,
                      score: 0,
                      volume: 0,
                    });
                  }}
                >
                  Use custom
                </button>
              </div>
            </Field>
          </div>
        )}
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
            Non-flex quotes need an existing Alcor pool pairing the quote with XUSDC or XPR. We try to auto-fill the
            deepest active pool; you can override the id.
          </p>
          <Field label="Proof pool id">
            <div className="flex flex-wrap gap-2">
              <input
                className="input min-w-[10rem] flex-1 font-mono"
                inputMode="numeric"
                placeholder="e.g. 2142"
                value={draft.proofPoolId}
                onChange={(e) => {
                  setProofHint("");
                  patch({ proofPoolId: e.target.value.replace(/\D/g, "") });
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={proofBusy}
                onClick={() => autofillProof(quote.symbol, quote.contract)}
              >
                {proofBusy ? "Finding…" : "Find pool"}
              </button>
            </div>
          </Field>
          {proofHint ? <p className="text-xs text-muted-foreground">{proofHint}</p> : null}
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
