import { useState } from "react";
import { Field, TxLink } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import {
  ALCOR_LOGO_UPLOAD,
  alcorLogoFilename,
  listingPacketText,
  type ListingDraft,
} from "@/services/listingHelper";
import { validImageUrl } from "@/services/tokenLogo";

type Props = {
  contract: string;
  symbol: string;
  precision: number;
  draft: ListingDraft;
  onChange?: (patch: Partial<ListingDraft>) => void;
  protonOn: boolean;
  canSign?: boolean;
  missing?: boolean;
  signing?: boolean;
  disabled?: boolean;
  onSign?: () => void;
  msg?: { tx?: string; err?: string };
  signHint?: string;
};

export function ListingPacket({
  contract,
  symbol,
  precision,
  draft,
  onChange,
  protonOn,
  canSign = false,
  missing = false,
  signing = false,
  disabled = false,
  onSign,
  msg,
  signHint,
}: Props) {
  const [copied, setCopied] = useState("");
  const file = alcorLogoFilename(symbol, contract);
  const iconOk = !draft.iconurl || validImageUrl(draft.iconurl);
  const editable = Boolean(onChange);

  const copy = async (kind: "packet" | "file") => {
    const text =
      kind === "file"
        ? file
        : listingPacketText({
            name: draft.tname,
            url: draft.url,
            desc: draft.desc,
            iconurl: draft.iconurl,
            symbol,
            contract,
            precision,
          });
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
            <Field label="Name">
              <input
                className="input"
                value={draft.tname}
                disabled={disabled}
                onChange={(e) => onChange?.({ tname: e.target.value })}
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
        Alcor wants <span className="font-mono">{file}</span> as a 64x64 PNG in their repo. Resize your Pinata image,
        then upload.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy("file")}>
          {copied === "file" ? "Copied filename" : "Copy filename"}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy("packet")}>
          {copied === "packet" ? "Copied packet" : "Copy listing packet"}
        </button>
        <a href={ALCOR_LOGO_UPLOAD} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
          Upload on GitHub
        </a>
      </div>
      {signHint ? <p className="text-xs text-muted-foreground">{signHint}</p> : null}
      {msg?.tx && msg.tx !== "ok" ? <TxLink tx={msg.tx} prefix="tx " /> : null}
      {msg?.err ? <p className="text-xs font-medium text-destructive">{msg.err}</p> : null}
      {canSign && onSign ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || signing || Boolean(draft.iconurl && !iconOk)}
          onClick={onSign}
        >
          {signing ? "Signing…" : missing ? "Sign token.proton::reg" : "Sign token.proton::update"}
        </button>
      ) : null}
    </div>
  );
}
