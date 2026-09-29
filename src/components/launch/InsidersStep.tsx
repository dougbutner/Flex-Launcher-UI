import { useState } from "react";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { ClubTimeField } from "@/components/launch/ClubTimeField";
import { PctBpsField } from "@/components/launch/PctBpsField";
import { Field, InfoBody, InfoLink, StepShell } from "@/components/launch/ui";
import { INSIDERS_GUIDE_PARAS } from "@/content/launchGuide";
import { defaultClubTimes, insidersStepValid } from "@/services/insidersClub";

type Props = {
  draft: LaunchDraft;
  patch: (p: Partial<LaunchDraft>) => void;
  onNext: () => void;
  onBack: () => void;
};

type Feat = "invites" | "nft" | "hold" | "lp" | "kyc" | "bonus";

const FEATS: Array<{ id: Feat; label: string }> = [
  { id: "invites", label: "Invites" },
  { id: "nft", label: "NFT" },
  { id: "hold", label: "Hold" },
  { id: "lp", label: "LP" },
  { id: "kyc", label: "KYC" },
  { id: "bonus", label: "LP Lock Bonus" },
];

function featOn(draft: LaunchDraft, id: Feat): boolean {
  if (id === "invites") return Boolean(draft.presaleInviteList.trim());
  if (id === "nft") return Boolean(draft.presaleCollection.trim() || draft.presaleSchema.trim() || draft.presaleNftMin);
  if (id === "hold") return Boolean(draft.presaleMinTokenQty.trim() || draft.presaleMinTokenContract.trim());
  if (id === "lp") return draft.presaleLpMin > 0;
  if (id === "kyc") return draft.presaleNeedKyc;
  return draft.presaleLockedInsiderBps > 0 || draft.presaleLockSecs > 0 || draft.presaleLockedLpMin > 0;
}

function clearFeat(id: Feat): Partial<LaunchDraft> {
  if (id === "invites") return { presaleInviteList: "" };
  if (id === "nft") return { presaleCollection: "", presaleSchema: "", presaleNftMin: 0 };
  if (id === "hold") return { presaleMinTokenQty: "", presaleMinTokenContract: "" };
  if (id === "lp") return { presaleLpMin: 0 };
  if (id === "kyc") return { presaleNeedKyc: false };
  return { presaleLockedInsiderBps: 0, presaleLockSecs: 0, presaleLockedLpMin: 0 };
}

export function InsidersStep({ draft, patch, onNext, onBack }: Props) {
  const invalid = insidersStepValid(draft);
  const on = draft.presaleEnabled;
  const signed = Boolean(draft.presaleTx);
  const lockDays = draft.presaleLockSecs > 0 ? Math.round(draft.presaleLockSecs / 86400) : 0;
  const [infoOpen, setInfoOpen] = useState(false);
  const [lpInfo, setLpInfo] = useState(false);
  const [bonusLpInfo, setBonusLpInfo] = useState(false);
  const [open, setOpen] = useState<Record<Feat, boolean>>({
    invites: featOn(draft, "invites"),
    nft: featOn(draft, "nft"),
    hold: featOn(draft, "hold"),
    lp: featOn(draft, "lp"),
    kyc: featOn(draft, "kyc"),
    bonus: featOn(draft, "bonus"),
  });

  const enable = (next: boolean) => {
    if (signed) return;
    if (next) {
      const times = defaultClubTimes();
      patch({
        presaleEnabled: true,
        presaleInsiderTime: draft.presaleInsiderTime || times.insider,
        presaleLaunchTime: draft.presaleLaunchTime || times.launch,
        presaleMode: 1,
      });
    } else {
      patch({ presaleEnabled: false });
    }
  };

  const toggle = (id: Feat) => {
    if (signed) return;
    if (open[id]) {
      patch(clearFeat(id));
      setOpen((s) => ({ ...s, [id]: false }));
    } else {
      if (id === "kyc") patch({ presaleNeedKyc: true });
      setOpen((s) => ({ ...s, [id]: true }));
    }
  };

  return (
    <StepShell
      title="Insiders"
      desc="Buy & LP early"
      titleAside={<InfoLink open={infoOpen} onToggle={() => setInfoOpen((v) => !v)} />}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={Boolean(invalid)} onClick={onNext}>
            Continue
          </button>
        </>
      }
    >
      <InfoBody open={infoOpen} paras={INSIDERS_GUIDE_PARAS} />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/40 p-3">
        <input type="checkbox" className="mt-1" checked={on} disabled={signed} onChange={(e) => enable(e.target.checked)} />
        <span>
          <span className="block text-sm font-semibold">Insiders before launch</span>
          <span className="mt-1 block text-xs text-muted-foreground">Skip for a normal public launch.</span>
        </span>
      </label>

      {on ? (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ClubTimeField
              label="Insider buys start"
              hint="When approved accounts can buy."
              value={draft.presaleInsiderTime}
              disabled={signed}
              onChange={(presaleInsiderTime) => patch({ presaleInsiderTime })}
            />
            <ClubTimeField
              label="Public launch"
              hint="When anyone can transfer. Must be after insider buys start."
              value={draft.presaleLaunchTime}
              disabled={signed}
              onChange={(presaleLaunchTime) => patch({ presaleLaunchTime })}
            />
            <PctBpsField
              sentence
              emptyZero
              label="Insider Max"
              hint="% of issued supply each approved account can hold."
              placeholder="1"
              bps={draft.presaleInsiderBps}
              disabled={signed}
              onBps={(presaleInsiderBps) => patch({ presaleInsiderBps })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`gate-anyall${draft.presaleGatesAll ? " is-all" : ""}`}
              disabled={signed}
              aria-pressed={draft.presaleGatesAll}
              title={draft.presaleGatesAll ? "Every set gate must pass" : "Any one set gate can pass"}
              onClick={() => patch({ presaleGatesAll: !draft.presaleGatesAll })}
            >
              {draft.presaleGatesAll ? "all" : "any"}
            </button>
            {FEATS.map((f) => {
              const selected = open[f.id] || featOn(draft, f.id);
              const square = f.id === "bonus";
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={signed}
                  onClick={() => toggle(f.id)}
                  className={`${square ? "rounded-none" : "rounded-xl"} border px-3 py-2 text-sm font-semibold transition-all ${
                    selected
                      ? square
                        ? "feat-bonus-on"
                        : "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background/50 hover:border-primary/40"
                  } ${signed ? "opacity-60" : ""}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {open.invites ? (
            <Field label="Invites" hint="Comma or space. These accounts skip the other gates." sentence>
              <textarea
                className="input min-h-[4.5rem] font-mono"
                placeholder="alice, bob"
                value={draft.presaleInviteList}
                disabled={signed}
                onChange={(e) => patch({ presaleInviteList: e.target.value })}
              />
            </Field>
          ) : null}

          {open.nft ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NFT" hint="AtomicAssets collection and schema." sentence>
                <div className="flex gap-2">
                  <input
                    className="input font-mono"
                    placeholder="collection"
                    value={draft.presaleCollection}
                    disabled={signed}
                    onChange={(e) => patch({ presaleCollection: e.target.value.trim().toLowerCase() })}
                  />
                  <input
                    className="input font-mono"
                    placeholder="schema"
                    value={draft.presaleSchema}
                    disabled={signed}
                    onChange={(e) => patch({ presaleSchema: e.target.value.trim().toLowerCase() })}
                  />
                </div>
              </Field>
              <Field label="NFT min" sentence>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="1"
                  value={draft.presaleNftMin || ""}
                  disabled={signed}
                  onChange={(e) => patch({ presaleNftMin: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </Field>
            </div>
          ) : null}

          {open.kyc ? (
            <Field label="KYC" hint="WebAuth verified on eosio.proton. Counts with NFT, Min Hold, and LP." sentence>
              <p className="text-sm text-muted-foreground">Buyers need a verified WebAuth profile.</p>
            </Field>
          ) : null}

          {open.hold ? (
            <Field
              label="Min Hold"
              hint={
                draft.presaleGatesAll
                  ? "Every set gate must pass. Empty gates = anyone can join."
                  : "Any one set gate can pass. Empty gates = anyone can join."
              }
              sentence
            >
              <div className="flex gap-2">
                <input
                  className="input font-mono"
                  placeholder="1.000000 EASY"
                  value={draft.presaleMinTokenQty}
                  disabled={signed}
                  onChange={(e) => patch({ presaleMinTokenQty: e.target.value })}
                />
                <input
                  className="input w-28 font-mono"
                  placeholder="mon3y"
                  value={draft.presaleMinTokenContract}
                  disabled={signed}
                  onChange={(e) => patch({ presaleMinTokenContract: e.target.value.trim().toLowerCase() })}
                />
              </div>
            </Field>
          ) : null}

          {open.lp ? (
            <Field
              label="Launch pool liquidity"
              hint="Minimum Alcor liquidity (L) a buyer needs in your launch pool. Not the pool id."
              sentence
              aside={<InfoLink open={lpInfo} onToggle={() => setLpInfo((v) => !v)} />}
            >
              <input
                className="input font-mono"
                inputMode="numeric"
                placeholder="0"
                value={draft.presaleLpMin || ""}
                disabled={signed}
                onChange={(e) => patch({ presaleLpMin: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
              {lpInfo ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Buyers pass when their positions in your launch pool add up to at least this liquidity number. Alcor
                  shows it as liquidity on the position, not as tokens and not as the pool id. After the pool exists,
                  open it on Alcor. The pool id is the number in the URL, and it is listed under the pool name. Each
                  position shows liquidity below the range. Use that figure here. Leave 0 to skip this gate.
                </p>
              ) : null}
            </Field>
          ) : null}

          {open.bonus ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <PctBpsField
                sentence
                emptyZero
                label="LP provider bonus"
                hint="Higher % of supply after they prove a locked position. Must be at least Insider Max."
                placeholder="0"
                bps={draft.presaleLockedInsiderBps}
                disabled={signed}
                onBps={(presaleLockedInsiderBps) => patch({ presaleLockedInsiderBps })}
              />
              <Field
                label="Insider LP lock days"
                hint="Unlock remaining must beat this. At least 3 days shorter than the 91-day main lock."
                sentence
              >
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="0"
                  value={lockDays || ""}
                  disabled={signed}
                  onChange={(e) => {
                    const days = Math.max(0, Math.min(87, Math.floor(Number(e.target.value) || 0)));
                    patch({ presaleLockSecs: days * 86400 });
                  }}
                />
              </Field>
              <Field
                label="Bonus LP liquidity"
                hint="Liquidity (L) the locked position must have. Not the pool id."
                sentence
                aside={<InfoLink open={bonusLpInfo} onToggle={() => setBonusLpInfo((v) => !v)} />}
              >
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="0"
                  value={draft.presaleLockedLpMin || ""}
                  disabled={signed}
                  onChange={(e) => patch({ presaleLockedLpMin: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
                {bonusLpInfo ? (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Same Alcor liquidity number as the join gate, for the locked position they prove to unlock the
                    higher cap. Open the pool on Alcor, copy liquidity from under the position (the pool id in the URL
                    is a different number), and paste it here.
                  </p>
                ) : null}
              </Field>
            </div>
          ) : null}
        </>
      ) : null}

      {invalid ? <p className="text-xs font-medium text-warning">{invalid}</p> : null}
    </StepShell>
  );
}
