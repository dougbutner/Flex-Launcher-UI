import { useEffect, useRef, useState } from "react";
import { FLEX_PROGRAMS, flexAccount, type FlexProgram } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { tokenStepValid } from "@/components/launch/draftPlan";
import { ContractPickModal } from "@/components/launch/ContractPickModal";
import { ProgramDots } from "@/components/token/ProgramDots";
import { TokenIcon } from "@/components/TokenIcon";
import { InfoPanel } from "@/components/launch/LaunchFees";
import { Field, InfoLink, StepShell, SupplyShortcuts } from "@/components/launch/ui";
import { CONTRACT_DOCS } from "@/content/flexContractDocs";
import { LAUNCH_GUIDE_PARAS } from "@/content/launchGuide";
import { formatSupplyCommas, parseSupplyInput, validSymbol } from "@/services/assets";
import { pinLogoFile } from "@/services/ipfsPin";
import { storeLogoFile } from "@/services/tokenIcons";
import { defaultTaxDraft } from "@/services/taxRates";
import { TOKEN_PROTON_TNAME_MAX } from "@/services/tokenProton";
import { validateTokenLogo, validImageUrl } from "@/services/tokenLogo";
import { txErrorMessage } from "@/services/txParse";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
};

function MaxSupplyField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(value);

  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setText(value);
    setEditing(false);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  if (disabled || !editing) {
    return (
      <button
        type="button"
        className="input w-full cursor-text text-left font-mono"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setText(value);
          setEditing(true);
        }}
      >
        {formatSupplyCommas(value) || "0"}
      </button>
    );
  }

  const commit = () => {
    const next = parseSupplyInput(text);
    if (!(Number(next) > 0)) return;
    committed.current = next;
    onCommit(next);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        className="input font-mono"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(parseSupplyInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          commit();
        }}
      />
      <button type="button" className="btn btn-primary shrink-0" onClick={commit}>
        Save
      </button>
    </div>
  );
}

export function TokenDetailsStep({ draft, patch, onNext }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const invalid = tokenStepValid(draft);
  const [pinning, setPinning] = useState(false);
  const [logoErr, setLogoErr] = useState("");
  const [docsFor, setDocsFor] = useState<FlexProgram | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(Boolean(draft.pinFailed || (draft.imageUrl && !draft.imageCid)));
  const urlReady = validImageUrl(draft.imageUrl);
  const preview = (urlReady ? draft.imageUrl : "") || draft.imageDataUrl;
  const showUrl = urlOpen || draft.pinFailed || Boolean(draft.imageUrl && !draft.imageCid);
  const tokenContract = flexAccount(draft.program);
  const programLocked = Boolean(draft.createTx);

  const onImage = async (file: File | undefined) => {
    if (!file || programLocked) return;
    setLogoErr("");
    const problem = await validateTokenLogo(file);
    if (problem) {
      setLogoErr(problem);
      return;
    }
    if (draft.imageDataUrl.startsWith("blob:")) URL.revokeObjectURL(draft.imageDataUrl);
    const local = URL.createObjectURL(file);
    patch({ imageDataUrl: local, imageCid: "", imageUrl: "", logoTx: "", pinFailed: false });
    setPinning(true);
    try {
      const pinned = await pinLogoFile(file);
      URL.revokeObjectURL(local);
      patch({ imageCid: pinned.cid, imageUrl: pinned.url, imageDataUrl: "", pinFailed: false });
      if (draft.symbol) void storeLogoFile(tokenContract, draft.symbol, pinned.cid, file);
    } catch (err) {
      setLogoErr(txErrorMessage(err));
      setUrlOpen(true);
      patch({ pinFailed: true });
    } finally {
      setPinning(false);
    }
  };

  return (
    <StepShell
      title="Launch your token"
      desc="Choose from three options, name and symbol."
      titleAside={<InfoLink open={guideOpen} onToggle={() => setGuideOpen((v) => !v)} />}
      footer={
        <>
          <span />
          <button type="button" className="btn btn-primary" disabled={Boolean(invalid)} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <InfoPanel open={guideOpen} paras={LAUNCH_GUIDE_PARAS} />
      {programLocked ? (
        <p className="text-xs text-warning">
          Token is already on-chain. Token fields are static so execute preflight cannot drift.
        </p>
      ) : null}
      <div
        className={`grid grid-cols-1 items-end gap-3 ${
          draft.program === "easyflex"
            ? "sm:grid-cols-[minmax(0,1.62fr)_minmax(0,0.62fr)_minmax(0,0.62fr)]"
            : draft.program === "complexflex"
              ? "sm:grid-cols-[minmax(0,0.62fr)_minmax(0,1.62fr)_minmax(0,0.62fr)]"
              : "sm:grid-cols-[minmax(0,0.62fr)_minmax(0,0.62fr)_minmax(0,1.62fr)]"
        }`}
      >
        {FLEX_PROGRAMS.map((p) => {
          const selected = draft.program === p.id;
          const account = flexAccount(p.id);
          const traits = CONTRACT_DOCS[p.id].traits;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (programLocked) return;
                const tax = defaultTaxDraft(p.id);
                patch({
                  program: p.id,
                  reflectionRate: tax.reflectionRate,
                  burnRate: tax.burnRate,
                  projectRate: tax.projectRate,
                  projectAccount: tax.projectAccount,
                  angelNumbersBps: tax.angelNumbersBps,
                  jackpotBps: tax.jackpotBps,
                });
              }}
              className={`tetra-shimmer group relative aspect-square overflow-hidden rounded-xl border bg-card text-left shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] transition-[flex,border-color] hover:border-primary/50 ${
                selected ? "border-primary/70" : "border-border"
              } ${programLocked && !selected ? "opacity-60" : ""}`}
            >
              <TokenIcon
                contract={account}
                symbol={draft.symbol || "F"}
                src={preview || undefined}
                fill
                className="pointer-events-none absolute inset-0 opacity-25 group-hover:opacity-40"
              />
              <span className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70" />
              <span className="relative flex h-full flex-col p-2">
                <span className="flex items-start justify-between gap-1">
                  <span
                    className={`min-w-0 leading-tight text-primary ${
                      selected ? "text-[10px] font-semibold" : "text-[8px] font-medium"
                    }`}
                  >
                    {CONTRACT_DOCS[p.id].tag}
                  </span>
                  <ProgramDots program={p.id} />
                </span>
                <span className="flex flex-1 flex-col items-center justify-center px-1 text-center">
                  <span
                    className={`truncate font-mono font-black tracking-tight ${
                      selected ? "text-3xl sm:text-5xl" : "text-xs sm:text-sm"
                    } ${draft.symbol ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {draft.symbol || "-"}
                  </span>
                  <span className={`font-mono font-bold text-primary ${selected ? "text-sm" : "text-[9px]"}`}>
                    @{account}
                  </span>
                </span>
                {selected ? (
                  <span className="mt-auto flex shrink-0 items-end justify-between gap-2">
                    <span className="grid grid-cols-3 items-start gap-x-2 gap-y-2 font-mono">
                      {traits.map((t) => (
                        <span key={t.k} className="flex flex-col leading-none">
                          <span className="text-[7px] uppercase tracking-wide text-muted-foreground">{t.k}</span>
                          <span className="mt-px text-[9px] font-semibold leading-none text-foreground">{t.v}</span>
                        </span>
                      ))}
                    </span>
                    <span
                      role="link"
                      tabIndex={0}
                      className="link shrink-0 text-[10px] font-semibold uppercase tracking-wider"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocsFor(p.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDocsFor(p.id);
                      }}
                    >
                      info
                    </span>
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {docsFor ? (
        <ContractPickModal program={docsFor} symbol={draft.symbol} onClose={() => setDocsFor(null)} />
      ) : null}

      <div className="flex items-start gap-5">
        <button
          type="button"
          onClick={() => !programLocked && fileRef.current?.click()}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-input bg-background/60 transition-colors hover:border-primary/60"
        >
          {preview ? (
            <img src={preview} alt="Token" className="h-full w-full object-cover" />
          ) : (
            <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-primary">
              Upload
              <br />
              art
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml"
            className="hidden"
            disabled={programLocked}
            onChange={(e) => void onImage(e.target.files?.[0])}
          />
        </button>
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Token name" hint={`Max ${TOKEN_PROTON_TNAME_MAX} characters.`}>
            <input
              className="input"
              placeholder="e.g. Flex Token"
              maxLength={TOKEN_PROTON_TNAME_MAX}
              value={draft.name}
              disabled={programLocked}
              onChange={(e) => patch({ name: e.target.value.slice(0, TOKEN_PROTON_TNAME_MAX) })}
            />
          </Field>
          <Field label="Symbol" hint="1-7 uppercase letters. Fixed forever.">
            <input
              className="input font-mono uppercase"
              placeholder="BARS"
              maxLength={7}
              value={draft.symbol}
              disabled={programLocked}
              onChange={(e) => patch({ symbol: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            />
            {draft.symbol && !validSymbol(draft.symbol) ? (
              <p className="mt-1.5 text-xs font-medium text-destructive">Invalid symbol.</p>
            ) : null}
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border bg-background/50 p-4 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-foreground">Token Logo</p>
          {!showUrl ? (
            <button type="button" className="link shrink-0 text-xs" disabled={programLocked} onClick={() => setUrlOpen(true)}>
              or paste a URL
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-muted-foreground">
          Square PNG or SVG, 256-1024px, max 1 MB. Pin to IPFS, or paste a public image URL. Wallets read logos from{" "}
          <span className="font-mono">token.proton::reg</span>, which must be signed by{" "}
          <span className="font-mono">{tokenContract}@active</span>, not the issuer. This wizard does not sign that.
        </p>
        {showUrl ? (
          <div className="mt-3">
            <Field
              label={draft.pinFailed ? "Image URL (required)" : "Image URL"}
              hint={
                draft.pinFailed
                  ? "Pinata could not pin this file. Paste a public https image URL to continue."
                  : "Direct link to a PNG or SVG. Used as iconurl on chain."
              }
              error={draft.imageUrl && !urlReady ? "Use a full http(s) URL." : undefined}
            >
              <input
                className="input font-mono text-xs"
                placeholder="https://"
                value={draft.imageUrl}
                disabled={programLocked}
                required={draft.pinFailed}
                onChange={(e) => patch({ imageUrl: e.target.value, imageCid: "", logoTx: "" })}
              />
            </Field>
          </div>
        ) : null}
        {pinning ? <p className="mt-2 text-primary">Pinning to IPFS…</p> : null}
        {draft.imageCid ? (
          <p className="mt-2 font-mono text-[11px] break-all">
            cid {draft.imageCid}
            <br />
            <a href={draft.imageUrl} target="_blank" rel="noopener noreferrer" className="link">
              {draft.imageUrl}
            </a>
          </p>
        ) : null}
        {logoErr ? <p className="mt-2 font-medium text-destructive">{logoErr}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Max supply"
          hint="100% is issued or minted to you, then deposited into the pool."
          aside={programLocked ? undefined : <SupplyShortcuts value={draft.maxSupply} onPick={(maxSupply) => patch({ maxSupply })} />}
        >
          <MaxSupplyField
            value={draft.maxSupply}
            disabled={programLocked}
            onCommit={(maxSupply) => patch({ maxSupply })}
          />
        </Field>
        <Field label="Decimal places" hint="0-8. Flex tokens default to 6.">
          <input
            className="input font-mono"
            inputMode="numeric"
            value={draft.precision}
            disabled={programLocked}
            onChange={(e) => {
              const n = Math.max(0, Math.min(8, Number(e.target.value.replace(/\D/g, "") || 0)));
              patch({ precision: n });
            }}
          />
        </Field>
      </div>

      <Field label="Description" hint="Optional - shown on the token page.">
        <textarea
          className="input min-h-[88px] resize-y"
          placeholder="What is this token? Why does it flex?"
          value={draft.description}
          disabled={programLocked}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Website">
          <input
            className="input"
            placeholder="https://"
            value={draft.website}
            disabled={programLocked}
            onChange={(e) => patch({ website: e.target.value })}
          />
        </Field>
        <Field label="X / Twitter">
          <input
            className="input"
            placeholder="@handle"
            value={draft.twitter}
            disabled={programLocked}
            onChange={(e) => patch({ twitter: e.target.value })}
          />
        </Field>
        <Field label="Telegram">
          <input
            className="input"
            placeholder="t.me/channel"
            value={draft.telegram}
            disabled={programLocked}
            onChange={(e) => patch({ telegram: e.target.value })}
          />
        </Field>
        <Field label="Farcaster">
          <input
            className="input"
            placeholder="@fid"
            value={draft.farcaster}
            disabled={programLocked}
            onChange={(e) => patch({ farcaster: e.target.value })}
          />
        </Field>
      </div>

      {invalid ? <p className="text-xs font-medium text-warning">{invalid}</p> : null}
    </StepShell>
  );
}
