import { useState } from "react";
import { Field, TxLink } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import type { FlexProgram } from "@/config/launch";
import {
  ALCOR_TOKEN_DOCS,
  ALCOR_UI_FORK,
  EOS_AIRDROPS_FORK,
  FLEX_TELEGRAM,
  alcorListingPrompt,
  alcorLogoFilename,
  logoRequestTooltip,
  type ListingDraft,
} from "@/services/listingHelper";
import { TOKEN_PROTON_TNAME_MAX } from "@/services/tokenProton";
import { validImageUrl } from "@/services/tokenLogo";

type Props = {
  contract: string;
  symbol: string;
  precision: number;
  draft: ListingDraft;
  program?: FlexProgram | null;
  onChange?: (patch: Partial<ListingDraft>) => void;
  protonOn: boolean;
  canSign?: boolean;
  missing?: boolean;
  signing?: boolean;
  disabled?: boolean;
  onSign?: () => void;
  onRemove?: () => void;
  removing?: boolean;
  msg?: { tx?: string; err?: string };
  signHint?: string;
};

export function ListingPacket({
  contract,
  symbol,
  precision,
  draft,
  program,
  onChange,
  protonOn,
  canSign = false,
  missing = false,
  signing = false,
  disabled = false,
  onSign,
  onRemove,
  removing = false,
  msg,
  signHint,
}: Props) {
  const [copied, setCopied] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const file = alcorLogoFilename(symbol, contract);
  const iconOk = !draft.iconurl || validImageUrl(draft.iconurl);
  const nameTooLong = draft.tname.trim().length > TOKEN_PROTON_TNAME_MAX;
  const editable = Boolean(onChange);
  const prompt = alcorListingPrompt({
    name: draft.tname,
    url: draft.url,
    desc: draft.desc,
    iconurl: draft.iconurl,
    symbol,
    contract,
    precision,
    twitter: draft.twitter,
    telegram: draft.telegram,
    farcaster: draft.farcaster,
  });

  const copy = async (kind: "file" | "prompt") => {
    if (kind === "prompt") setGuideOpen(true);
    const text = kind === "file" ? file : prompt;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <TokenIcon contract={contract} symbol={symbol} src={iconOk ? draft.iconurl : undefined} size={48} rounded="xl" />
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold">
            {precision},{symbol} @ {contract}
          </p>
          <p className="text-xs text-muted-foreground">
            {protonOn ? "On token.proton" : "Not on token.proton yet"}
          </p>
        </div>
      </div>
      {editable ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Name"
              hint={`Max ${TOKEN_PROTON_TNAME_MAX} characters.`}
              error={nameTooLong ? `Max ${TOKEN_PROTON_TNAME_MAX} characters.` : undefined}
            >
              <input
                className="input"
                maxLength={TOKEN_PROTON_TNAME_MAX}
                value={draft.tname}
                disabled={disabled}
                onChange={(e) => onChange?.({ tname: e.target.value.slice(0, TOKEN_PROTON_TNAME_MAX) })}
              />
            </Field>
            <Field label="URL">
              <input
                className="input"
                placeholder="https://"
                value={draft.url}
                disabled={disabled}
                onChange={(e) => onChange?.({ url: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description">
            <input
              className="input"
              value={draft.desc}
              disabled={disabled}
              onChange={(e) => onChange?.({ desc: e.target.value })}
            />
          </Field>
          <Field label="Icon URL" error={draft.iconurl && !iconOk ? "Use a full http(s) URL." : undefined}>
            <input
              className="input font-mono text-xs"
              placeholder="https://"
              value={draft.iconurl}
              disabled={disabled}
              onChange={(e) => onChange?.({ iconurl: e.target.value })}
            />
          </Field>
        </>
      ) : (
        <p className="text-xs text-muted-foreground break-all">
          {draft.iconurl || "No icon URL saved yet. Paste one in Manager metadata."}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Alcor wants <span className="font-mono">{file}</span> as a 64x64 PNG. Fork their repo, then paste the prompt
        into Cursor or GitHub Copilot. Do not try to upload into Alcor's own GitHub.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          title="Paste this prompt into Cursor or GitHub Copilot"
          onClick={() => void copy("prompt")}
        >
          {copied === "prompt" ? "Copied prompt" : "Copy AI prompt"}
        </button>
        <a href={ALCOR_TOKEN_DOCS} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
          Alcor listing docs
        </a>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy("file")}>
          {copied === "file" ? "Copied filename" : "Copy filename"}
        </button>
      </div>
      {guideOpen ? (
        <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold">Alcor listing guide</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGuideOpen(false)}>
              Hide
            </button>
          </div>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              Fork{" "}
              <a href={ALCOR_UI_FORK} target="_blank" rel="noopener noreferrer" className="link">
                alcor-ui
              </a>{" "}
              and{" "}
              <a href={EOS_AIRDROPS_FORK} target="_blank" rel="noopener noreferrer" className="link">
                eos-airdrops
              </a>
              . You cannot push to the original repos.
            </li>
            <li>Paste the copied prompt into Cursor or GitHub Copilot so it can download the IPFS image and write the JSON.</li>
            <li>
              Open pull requests from your forks. Docs:{" "}
              <a href={ALCOR_TOKEN_DOCS} target="_blank" rel="noopener noreferrer" className="link">
                adding token information
              </a>
              .
            </li>
          </ol>
          <textarea
            className="input min-h-[180px] resize-y font-mono text-[11px] leading-snug"
            readOnly
            value={prompt}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      ) : null}
      {signHint ? <p className="text-xs text-muted-foreground">{signHint}</p> : null}
      {msg?.tx && msg.tx !== "ok" ? <TxLink tx={msg.tx} prefix="tx " /> : null}
      {msg?.err ? <p className="text-xs font-medium text-destructive">{msg.err}</p> : null}
      {canSign && onSign ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled || signing || nameTooLong || Boolean(draft.iconurl && !iconOk)}
            onClick={onSign}
          >
            {signing ? "Signing…" : missing ? "Sign token.proton::reg" : "Sign token.proton::update"}
          </button>
          {!missing && onRemove ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={disabled || signing || removing}
              onClick={onRemove}
            >
              {removing ? "Removing…" : "Sign token.proton::remove"}
            </button>
          ) : null}
        </div>
      ) : (
        <a
          href={FLEX_TELEGRAM}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-sm"
          title={logoRequestTooltip(symbol, program)}
        >
          Request token logo added
        </a>
      )}
    </div>
  );
}
