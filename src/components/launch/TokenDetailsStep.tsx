import { useRef } from "react";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { tokenStepValid } from "@/components/launch/draftPlan";
import { Field, StepShell } from "@/components/launch/ui";
import { validSymbol } from "@/services/assets";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
};

export function TokenDetailsStep({ draft, patch, onNext }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const invalid = tokenStepValid(draft);

  const onImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512 * 1024) {
      alert("Keep the image under 512 KB — it is stored locally in your browser draft.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ imageDataUrl: String(reader.result ?? "") });
    reader.readAsDataURL(file);
  };

  return (
    <StepShell
      title="Create a token"
      desc="The basics. Precision and ticker are permanent once forged."
      footer={
        <>
          <span />
          <button type="button" className="btn btn-primary" disabled={Boolean(invalid)} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <div className="flex items-start gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-input bg-background/60 transition-colors hover:border-primary/60"
        >
          {draft.imageDataUrl ? (
            <img src={draft.imageDataUrl} alt="Token" className="h-full w-full object-cover" />
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
            accept="image/*"
            className="hidden"
            onChange={(e) => onImage(e.target.files?.[0])}
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
          <Field label="Ticker" hint="1–7 uppercase letters. Fixed forever.">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Max supply" hint="100% is minted to you, then deposited into the pool.">
          <input
            className="input font-mono"
            inputMode="decimal"
            placeholder="1000000"
            value={draft.maxSupply}
            onChange={(e) => patch({ maxSupply: e.target.value.replace(/[^\d.]/g, "") })}
          />
        </Field>
        <Field label="Precision" hint="Decimal places (0–8). Flex tokens usually use 4.">
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

      <Field label="Description" hint="Optional — shown on the token page.">
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
