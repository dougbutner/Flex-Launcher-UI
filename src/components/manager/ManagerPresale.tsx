import { useEffect, useState } from "react";
import { ClubTimeField } from "@/components/launch/ClubTimeField";
import { PctBpsField } from "@/components/launch/PctBpsField";
import { Field, TxLink } from "@/components/launch/ui";
import { FormPanelSkeleton } from "@/components/ui/PageSkeletons";
import {
  addinsidersAction,
  goliveAction,
  rminsiderAction,
  setpresaleAction,
  type ChainAction,
} from "@/services/launchActions";
import { readInsiders, readLaunch, readPresale } from "@/services/flexTables";
import {
  defaultClubTimes,
  localToUnix,
  parseInviteAccounts,
  presaleAdjustError,
  presaleAdjustState,
  unixToLocal,
  type PresaleAdjust,
} from "@/services/insidersClub";
import { assetAmountNumber, validAccount } from "@/services/assets";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

const MODES = [
  { id: 0, label: "Freeze" },
  { id: 1, label: "Buy window" },
  { id: 2, label: "Buy and LP" },
  { id: 3, label: "Buy, LP in" },
];

type Feat = "invites" | "nft" | "hold" | "lp" | "kyc" | "bonus";

const FEATS: Array<{ id: Feat; label: string }> = [
  { id: "invites", label: "Invites" },
  { id: "nft", label: "NFT" },
  { id: "hold", label: "Hold" },
  { id: "lp", label: "LP" },
  { id: "kyc", label: "KYC" },
  { id: "bonus", label: "LP Lock Bonus" },
];

function emptyForm(): PresaleAdjust {
  const times = defaultClubTimes();
  return {
    insiderTime: times.insider,
    launchTime: times.launch,
    mode: 1,
    insiderBps: 0,
    lockedInsiderBps: 0,
    collection: "",
    schema: "",
    nftMin: 0,
    minTokenQty: "",
    minTokenContract: "",
    lpMin: 0,
    lockSecs: 0,
    lockedLpMin: 0,
    needKyc: false,
    gatesAll: false,
    inviteList: "",
  };
}

function accountField(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.trim().toLowerCase();
  return validAccount(name) ? name : "";
}

function formFromRow(row: Record<string, unknown> | null): PresaleAdjust {
  if (!row) return emptyForm();
  const min = row.min_token as { quantity?: string; contract?: string } | undefined;
  const qty = String(min?.quantity ?? "");
  const hold = assetAmountNumber(qty) > 0;
  const mode = Number(row.mode ?? 1);
  return {
    insiderTime: unixToLocal(Number(row.insider_time ?? 0)),
    launchTime: unixToLocal(Number(row.launch_time ?? 0)),
    mode: Number.isFinite(mode) ? Math.min(3, Math.max(0, Math.floor(mode))) : 1,
    insiderBps: Number(row.insider_bps ?? 0),
    lockedInsiderBps: Number(row.locked_insider_bps ?? 0),
    collection: accountField(row.collection),
    schema: accountField(row.schema),
    nftMin: Number(row.nft_min ?? 0),
    minTokenQty: hold ? qty : "",
    minTokenContract: hold ? accountField(min?.contract) : "",
    lpMin: Number(row.lp_min ?? 0),
    lockSecs: Number(row.lock_secs ?? 0),
    lockedLpMin: Number(row.locked_lp_min ?? 0),
    needKyc: Boolean(row.need_kyc),
    gatesAll: Boolean(row.gates_all),
    inviteList: "",
  };
}

function featOn(form: PresaleAdjust, id: Feat): boolean {
  if (id === "invites") return Boolean(form.inviteList.trim());
  if (id === "nft") return Boolean(form.collection.trim() || form.schema.trim() || form.nftMin);
  if (id === "hold") return Boolean(form.minTokenQty.trim() || form.minTokenContract.trim());
  if (id === "lp") return form.lpMin > 0;
  if (id === "kyc") return form.needKyc;
  return form.lockedInsiderBps > 0 || form.lockSecs > 0 || form.lockedLpMin > 0;
}

function clearFeat(id: Feat): Partial<PresaleAdjust> {
  if (id === "invites") return { inviteList: "" };
  if (id === "nft") return { collection: "", schema: "", nftMin: 0 };
  if (id === "hold") return { minTokenQty: "", minTokenContract: "" };
  if (id === "lp") return { lpMin: 0 };
  if (id === "kyc") return { needKyc: false };
  return { lockedInsiderBps: 0, lockSecs: 0, lockedLpMin: 0 };
}

type Props = {
  contract: string;
  symbol: string;
  actor: string;
  transact: (actions: ChainAction[]) => Promise<unknown>;
};

export function ManagerPresale({ contract, symbol, actor, transact }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [launched, setLaunched] = useState(false);
  const [hasRow, setHasRow] = useState(false);
  const [poolId, setPoolId] = useState(0);
  const [insiders, setInsiders] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState<PresaleAdjust>(emptyForm);
  const [open, setOpen] = useState<Record<Feat, boolean>>({
    invites: false,
    nft: false,
    hold: false,
    lp: false,
    kyc: false,
    bonus: false,
  });
  const [rmAccount, setRmAccount] = useState("");
  const [signing, setSigning] = useState(false);
  const [msg, setMsg] = useState("");
  const [tx, setTx] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setMsg("");
    setTx("");
    void Promise.all([
      readLaunch(contract, symbol).catch(() => null),
      readPresale(contract, symbol).catch(() => null),
      readInsiders(contract, symbol).catch(() => [] as Record<string, unknown>[]),
    ])
      .then(([launch, presale, rows]) => {
        if (cancelled) return;
        const next = formFromRow(presale);
        setLaunched(Boolean(launch?.launched));
        setHasRow(Boolean(presale));
        setPoolId(Number(launch?.pure_liquid_alcor_pool_id ?? 0));
        setInsiders(rows);
        setForm(next);
        setOpen({
          invites: false,
          nft: featOn(next, "nft"),
          hold: featOn(next, "hold"),
          lp: featOn(next, "lp"),
          kyc: featOn(next, "kyc"),
          bonus: featOn(next, "bonus"),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(txErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contract, symbol, reload]);

  const state = presaleAdjustState(launched, hasRow);
  const writable = state === "open";
  const invalid = writable ? presaleAdjustError(form) : null;
  const lockDays = form.lockSecs > 0 ? Math.round(form.lockSecs / 86400) : 0;

  const run = async (actions: ChainAction[]) => {
    setSigning(true);
    setMsg("");
    setTx("");
    try {
      const res = await transact(actions);
      setTx(txIdFromResult(res) || "ok");
      setReload((n) => n + 1);
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg(hint ? `${text} - ${hint}` : text);
    } finally {
      setSigning(false);
    }
  };

  const save = () => {
    const err = presaleAdjustError(form);
    if (err) {
      setMsg(err);
      setTx("");
      return;
    }
    const actions: ChainAction[] = [
      setpresaleAction(contract, symbol, {
        launchTime: localToUnix(form.launchTime),
        insiderTime: localToUnix(form.insiderTime),
        mode: form.mode,
        insiderBps: form.insiderBps,
        lockedInsiderBps: form.lockedInsiderBps,
        collection: form.collection,
        schema: form.schema,
        nftMin: form.nftMin,
        minTokenQuantity: form.minTokenQty,
        minTokenContract: form.minTokenContract,
        lpMin: form.lpMin,
        lockedLpMin: form.lockedLpMin,
        lockSecs: form.lockSecs,
        needKyc: form.needKyc,
        gatesAll: form.gatesAll,
      }),
    ];
    const names = parseInviteAccounts(form.inviteList);
    if (names.length) actions.push(addinsidersAction(contract, symbol, names.join(",")));
    void run(actions);
  };

  const toggle = (id: Feat) => {
    if (!writable) return;
    if (open[id] || featOn(form, id)) {
      setForm((f) => ({ ...f, ...clearFeat(id) }));
      setOpen((s) => ({ ...s, [id]: false }));
    } else {
      if (id === "kyc") setForm((f) => ({ ...f, needKyc: true }));
      setOpen((s) => ({ ...s, [id]: true }));
    }
  };

  if (loading) return <FormPanelSkeleton />;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-4 border-t border-border pt-5">
      {state === "missed" ? (
        <p className="text-sm text-muted-foreground">
          This token lifted off with no presale row, so launched is already true. A presale cannot be added.
        </p>
      ) : null}
      {state === "sealed" ? (
        <p className="text-sm text-muted-foreground">
          Launched is true. setpresale is closed. Invites can still be added or removed.
        </p>
      ) : null}
      {state === "open" ? (
        <p className="text-sm text-muted-foreground">
          {hasRow
            ? "Launched is still false, so setpresale replaces every field. Times can move earlier."
            : "No presale row yet. Saving writes one. Liftoff then leaves launched false until you sign Launch."}
        </p>
      ) : null}

      {writable ? (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ClubTimeField
              label="Insider buys start"
              hint="Approved accounts can buy from this time. It can move earlier while launched is false."
              value={form.insiderTime}
              disabled={signing}
              onChange={(insiderTime) => setForm((f) => ({ ...f, insiderTime }))}
            />
            <ClubTimeField
              label="Public launch"
              hint="Must stay after insider buys start. It can move earlier while launched is false."
              value={form.launchTime}
              disabled={signing}
              onChange={(launchTime) => setForm((f) => ({ ...f, launchTime }))}
            />
            <PctBpsField
              sentence
              emptyZero
              label="Insider Max"
              hint="% of issued supply each approved account can hold."
              placeholder="1"
              bps={form.insiderBps}
              disabled={signing}
              onBps={(insiderBps) => setForm((f) => ({ ...f, insiderBps }))}
            />
            <Field label="Mode" hint="Freeze blocks gated transfers. Modes 1-3 share the same buy list and times." sentence>
              <select
                className="input"
                value={form.mode}
                disabled={signing}
                onChange={(e) => setForm((f) => ({ ...f, mode: Number(e.target.value) }))}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`gate-anyall${form.gatesAll ? " is-all" : ""}`}
              disabled={signing}
              aria-pressed={form.gatesAll}
              title={form.gatesAll ? "Every set gate must pass" : "Any one set gate can pass"}
              onClick={() => setForm((f) => ({ ...f, gatesAll: !f.gatesAll }))}
            >
              {form.gatesAll ? "all" : "any"}
            </button>
            {FEATS.map((f) => {
              const selected = open[f.id] || featOn(form, f.id);
              const square = f.id === "bonus";
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={signing}
                  onClick={() => toggle(f.id)}
                  className={`${square ? "rounded-none" : "rounded-xl"} border px-3 py-2 text-sm font-semibold ${
                    selected
                      ? square
                        ? "feat-bonus-on"
                        : "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background/50 hover:border-primary/40"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {open.invites || featOn(form, "invites") ? (
            <Field label="New invites" hint="Comma or space. Signed with setpresale. Existing rows stay until you remove them." sentence>
              <textarea
                className="input min-h-[4.5rem] font-mono"
                placeholder="alice, bob"
                value={form.inviteList}
                disabled={signing}
                onChange={(e) => setForm((f) => ({ ...f, inviteList: e.target.value }))}
              />
            </Field>
          ) : null}

          {open.nft || featOn(form, "nft") ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NFT" hint="AtomicAssets collection and schema. Both are required if either is set." sentence>
                <div className="flex gap-2">
                  <input
                    className="input font-mono"
                    placeholder="collection"
                    value={form.collection}
                    disabled={signing}
                    onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value.trim().toLowerCase() }))}
                  />
                  <input
                    className="input font-mono"
                    placeholder="schema"
                    value={form.schema}
                    disabled={signing}
                    onChange={(e) => setForm((f) => ({ ...f, schema: e.target.value.trim().toLowerCase() }))}
                  />
                </div>
              </Field>
              <Field label="NFT min" hint="A collection with min 0 is stored as 1." sentence>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="1"
                  value={form.nftMin || ""}
                  disabled={signing}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nftMin: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))
                  }
                />
              </Field>
            </div>
          ) : null}

          {open.kyc || form.needKyc ? (
            <Field label="KYC" hint="WebAuth verified on eosio.proton. Counts with NFT, Min Hold, and LP." sentence>
              <p className="text-sm text-muted-foreground">Buyers need a verified WebAuth profile.</p>
            </Field>
          ) : null}

          {open.hold || featOn(form, "hold") ? (
            <Field label="Min Hold" hint="Quantity and contract. Amount 0 is stored as no hold gate." sentence>
              <div className="flex gap-2">
                <input
                  className="input font-mono"
                  placeholder="1.000000 EASY"
                  value={form.minTokenQty}
                  disabled={signing}
                  onChange={(e) => setForm((f) => ({ ...f, minTokenQty: e.target.value }))}
                />
                <input
                  className="input w-28 font-mono"
                  placeholder="mon3y"
                  value={form.minTokenContract}
                  disabled={signing}
                  onChange={(e) => setForm((f) => ({ ...f, minTokenContract: e.target.value.trim().toLowerCase() }))}
                />
              </div>
            </Field>
          ) : null}

          {open.lp || featOn(form, "lp") ? (
            <Field label="Launch pool liquidity" hint="Minimum Alcor liquidity (L) in the launch pool. Not the pool id." sentence>
              <input
                className="input font-mono"
                inputMode="numeric"
                placeholder="0"
                value={form.lpMin || ""}
                disabled={signing}
                onChange={(e) => setForm((f) => ({ ...f, lpMin: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              />
            </Field>
          ) : null}

          {open.bonus || featOn(form, "bonus") ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <PctBpsField
                sentence
                emptyZero
                label="LP provider bonus"
                hint="Higher % of supply after a proven lock. Must be at least Insider Max when set."
                placeholder="0"
                bps={form.lockedInsiderBps}
                disabled={signing}
                onBps={(lockedInsiderBps) => setForm((f) => ({ ...f, lockedInsiderBps }))}
              />
              <Field
                label="Insider LP lock days"
                hint="When set, must be at least 3 days shorter than the 90d main lock."
                sentence
              >
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="0"
                  value={lockDays || ""}
                  disabled={signing}
                  onChange={(e) => {
                    const days = Math.max(0, Math.min(87, Math.floor(Number(e.target.value) || 0)));
                    setForm((f) => ({ ...f, lockSecs: days * 86400 }));
                  }}
                />
              </Field>
              <Field label="Bonus LP liquidity" hint="Liquidity (L) the locked position must have." sentence>
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.lockedLpMin || ""}
                  disabled={signing}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lockedLpMin: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))
                  }
                />
              </Field>
            </div>
          ) : null}

          {invalid ? <p className="text-xs font-medium text-warning">{invalid}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={signing || Boolean(invalid)} onClick={save}>
              {signing ? "Signing…" : hasRow ? "Update presale" : "Save presale"}
            </button>
            {hasRow && poolId > 0 ? (
              <button
                type="button"
                className="btn btn-accent btn-sm"
                disabled={signing || actor.length === 0}
                onClick={() => void run([goliveAction(contract, symbol)])}
              >
                Launch
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {hasRow ? (
        <div className="space-y-3">
          <Field label="On-chain list" hint="Add or remove accounts. This stays available after setpresale is closed." sentence>
            <div className="flex flex-wrap gap-2">
              {!writable ? (
                <input
                  className="input min-w-[12rem] flex-1 font-mono"
                  placeholder="alice,bob"
                  value={form.inviteList}
                  disabled={signing}
                  onChange={(e) => setForm((f) => ({ ...f, inviteList: e.target.value }))}
                />
              ) : null}
              {!writable ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={signing || !form.inviteList.trim()}
                  onClick={() => {
                    const names = parseInviteAccounts(form.inviteList);
                    const bad = names.find((n) => !validAccount(n));
                    if (bad) {
                      setMsg(`Bad account ${bad}. Use 1-12 char names (a-z, 1-5).`);
                      return;
                    }
                    if (!names.length) return;
                    void run([addinsidersAction(contract, symbol, names.join(","))]);
                  }}
                >
                  Add
                </button>
              ) : null}
              <input
                className="input w-40 font-mono"
                placeholder="remove account"
                value={rmAccount}
                disabled={signing}
                onChange={(e) => setRmAccount(e.target.value.trim().toLowerCase())}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={signing || !validAccount(rmAccount)}
                onClick={() => void run([rminsiderAction(contract, rmAccount, symbol)])}
              >
                Remove
              </button>
            </div>
          </Field>
          {insiders.length ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {insiders.map((row) => {
                const account = String(row.account ?? "");
                const pos = Number(row.locked_pos ?? 0);
                return (
                  <li key={account} className="font-mono text-muted-foreground">
                    {account}
                    {row.approved ? " · approved" : ""}
                    {pos > 0 ? ` · lock ${pos}` : ""}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No insider rows yet.</p>
          )}
        </div>
      ) : null}

      {tx ? (
        <p className="text-xs text-muted-foreground">
          Saved · <TxLink tx={tx} />
        </p>
      ) : null}
      {msg ? <p className="text-xs text-destructive">{msg}</p> : null}
    </div>
  );
}
