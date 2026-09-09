import { useRef, useState } from "react";
import { FLEX_PROGRAMS, flexAccount, type FlexProgram } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { tokenStepValid } from "@/components/launch/draftPlan";
import { Field, StepShell } from "@/components/launch/ui";
import { validSymbol } from "@/services/assets";
import { pinLogoFile } from "@/services/ipfsPin";
import { validateTokenLogo, validImageUrl } from "@/services/tokenLogo";
import { txErrorMessage } from "@/services/txParse";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
};

export function TokenDetailsStep({ draft, patch, onNext }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const invalid = tokenStepValid(draft);
  const [pinning, setPinning] = useState(false);
  const [logoErr, setLogoErr] = useState("");
  const [urlOpen, setUrlOpen] = useState(Boolean(draft.pinFailed || (draft.imageUrl && !draft.imageCid)));
  const urlReady = validImageUrl(draft.imageUrl);
  const preview = (urlReady ? draft.imageUrl : "") || draft.imageDataUrl;
  const showUrl = urlOpen || draft.pinFailed || Boolean(draft.imageUrl && !draft.imageCid);
  const tokenContract = flexAccount(draft.program);
  const programLocked = Boolean(draft.createTx);

  const onImage = async (file: File | undefined) => {
    if (!file) return;
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
      title="Create a token"
      desc="Pick a program, then name and ticker. Precision and ticker are permanent once created."
      footer={
        <>
          <span />
          <button type="button" className="btn btn-primary" disabled={Boolean(invalid)} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Program</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FLEX_PROGRAMS.map((p) => {
            const selected = draft.program === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={programLocked}
                onClick={() => patch({ program: p.id as FlexProgram })}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                } ${programLocked ? "opacity-60" : ""}`}
              >
                <div className="font-mono text-sm font-bold">{p.title}</div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{flexAccount(p.id)}</div>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{p.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
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
            onChange={(e) => void onImage(e.target.files?.[0])}
          />
        </button>
        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Token name">
            <input
              className="input"
              placeholder="e.g. Flex Forex"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Ticker" hint="1-7 uppercase letters. Fixed forever.">
            <input
              className="input font-mono uppercase"
              placeholder="FOO"
              maxLength={7}
              value={draft.symbol}
              onChange={(e) => patch({ symbol: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            />
            {draft.symbol && !validSymbol(draft.symbol) ? (
              <p className="mt-1.5 text-xs font-medium text-destructive">Invalid ticker.</p>
            ) : null}
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border bg-background/50 p-4 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-semibold text-foreground">Token art</p>
          {!showUrl ? (
            <button type="button" className="link shrink-0 text-xs" onClick={() => setUrlOpen(true)}>
              or paste a URL
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-muted-foreground">
          Square PNG or SVG, 256-512px, max 1 MB. Pin to IPFS, or paste a public image URL. Wallets read logos from{" "}
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
        <Field label="Max supply" hint="100% is issued or minted to you, then deposited into the pool.">
          <input
            className="input font-mono"
            inputMode="decimal"
            placeholder="1000000"
            value={draft.maxSupply}
            onChange={(e) => patch({ maxSupply: e.target.value.replace(/[^\d.]/g, "") })}
          />
        </Field>
        <Field label="Precision" hint="Decimal places (0-8). Flex tokens usually use 6.">
          <input
            className="input font-mono"
            inputMode="numeric"
            value={draft.precision}
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
          onChange={(e) => patch({ description: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Website">
          <input
            className="input"
            placeholder="https://"
            value={draft.website}
            onChange={(e) => patch({ website: e.target.value })}
          />
        </Field>
        <Field label="X / Twitter">
          <input
            className="input"
            placeholder="@handle"
            value={draft.twitter}
            onChange={(e) => patch({ twitter: e.target.value })}
          />
        </Field>
        <Field label="Telegram">
          <input
            className="input"
            placeholder="t.me/…"
            value={draft.telegram}
            onChange={(e) => patch({ telegram: e.target.value })}
          />
        </Field>
        <Field label="Farcaster">
          <input
            className="input"
            placeholder="@fid"
            value={draft.farcaster}
            onChange={(e) => patch({ farcaster: e.target.value })}
          />
        </Field>
      </div>

      {invalid ? <p className="text-xs font-medium text-warning">{invalid}</p> : null}
    </StepShell>
  );
}
