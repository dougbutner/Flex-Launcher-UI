import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field, StatusIcon, TxLink } from "@/components/launch/ui";
import { AirdropPanel } from "@/components/manager/AirdropPanel";
import { ManagerPresale } from "@/components/manager/ManagerPresale";
import { WinnerTextLink } from "@/components/winners/WinnerTextLink";
import { RainDefaultsFields } from "@/components/launch/RainDefaultsFields";
import { TaxBucketsForm } from "@/components/launch/TaxBucketsForm";
import { TokenIcon } from "@/components/TokenIcon";
import { TokenListingCard } from "@/components/token/TokenListingCard";
import { flexMeta } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { MANAGER_RESUME_KEY, writeLaunchDraft } from "@/hooks/useLaunchDraft";
import { listIssuerTokens } from "@/services/issuerTokens";
import { pinLogoFile } from "@/services/ipfsPin";
import { listManagerTokens, upsertManagerToken } from "@/services/managerApi";
import { ipfsCid, storeLogoFile } from "@/services/tokenIcons";
import { validateTokenLogo } from "@/services/tokenLogo";
import { draftFromManager } from "@/services/managerDraft";
import {
  applyManagerMeta,
  LAUNCH_STEP_IDS,
  LAUNCH_STEPS,
  managerHasStarted,
  managerTokenKey,
  mergeManagerViews,
  sanitizeManagerMeta,
  type ManagerMetaPatch,
  type ManagerToken,
  type ManagerView,
} from "@/services/managerStore";
import { formatSupplyCommas, parseAsset } from "@/services/assets";
import { readSettings } from "@/services/flexTables";
import { payoutAction, ratiosAction, setfeesAction, goliveAction, type ChainAction } from "@/services/launchActions";
import { rainFromRow, type RainDefaults } from "@/services/rainDefaults";
import { hasProjectTax, taxAdjustValid, taxFromSettings, taxSavePlan, type TaxDraft } from "@/services/taxRates";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { TOKEN_PROTON_TNAME_MAX } from "@/services/tokenProton";
import { FormPanelSkeleton, ManagerSkeleton } from "@/components/ui/PageSkeletons";

function formatManagerSupply(raw: string): string {
  const parsed = parseAsset(raw);
  if (parsed) return `${formatSupplyCommas(parsed.amount)} ${parsed.symbol}`;
  return formatSupplyCommas(raw);
}

export default function Manager() {
  const { actor, isLoggedIn, addWebAuthWallet, transact } = useWallet();
  const navigate = useNavigate();
  const [views, setViews] = useState<ManagerView[] | null>(null);
  const [selected, setSelected] = useState("");
  const [meta, setMeta] = useState<ManagerMetaPatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [tax, setTax] = useState<TaxDraft | null>(null);
  const [taxBusy, setTaxBusy] = useState(false);
  const [taxMsg, setTaxMsg] = useState("");
  const [taxTx, setTaxTx] = useState<{ label: string; id: string } | null>(null);
  const [raining, setRaining] = useState(false);
  const [rainMsg, setRainMsg] = useState("");
  const [rainTx, setRainTx] = useState("");
  const [rain, setRain] = useState<RainDefaults>({ rainMinHold: 0, rainMinPool: 0 });
  const [rainSaving, setRainSaving] = useState(false);
  const [rainSaveMsg, setRainSaveMsg] = useState("");
  const [tool, setTool] = useState<"meta" | "tax" | "airdrop" | "presale">("meta");

  const load = useCallback(async () => {
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      let stored: ManagerToken[] = [];
      try {
        stored = await listManagerTokens({ issuer: actor });
      } catch {
        stored = [];
      }
      const chain = await listIssuerTokens(actor).catch(() => []);
      const next = mergeManagerViews(chain, stored);
      setViews(next);
      setSelected((cur) => {
        if (cur && next.some((v) => managerTokenKey(v.token.contract, v.token.symbol) === cur)) return cur;
        return next[0] ? managerTokenKey(next[0].token.contract, next[0].token.symbol) : "";
      });
    } catch (err) {
      setError(txErrorMessage(err));
      setViews([]);
    } finally {
      setBusy(false);
    }
  }, [actor]);

  useEffect(() => {
    if (isLoggedIn && actor) void load();
    else {
      setViews(null);
      setSelected("");
      setMeta(null);
    }
  }, [isLoggedIn, actor, load]);

  const view = views?.find((v) => managerTokenKey(v.token.contract, v.token.symbol) === selected) ?? null;

  useEffect(() => {
    if (!view) {
      setMeta(null);
      setSettings(null);
      setTax(null);
      setTaxMsg("");
      return;
    }
    setMeta({
      name: view.token.name || view.token.symbol,
      description: view.token.description,
      website: view.token.website,
      twitter: view.token.twitter,
      telegram: view.token.telegram,
      farcaster: view.token.farcaster,
      imageUrl: view.token.imageUrl,
    });
    setSaveMsg("");
    setTaxMsg("");
    setTaxTx(null);
    setRainMsg("");
    setRainTx("");
    setRain(rainFromRow(view.token));
    setRainSaveMsg("");
    let cancelled = false;
    void readSettings(view.token.contract, view.token.symbol)
      .then((row) => {
        if (cancelled) return;
        setSettings(row);
        setTax(taxFromSettings(view.token.program, row));
      })
      .catch(() => {
        if (cancelled) return;
        setSettings(null);
        setTax(null);
      });
    return () => {
      cancelled = true;
    };
  }, [view?.token.contract, view?.token.symbol, view?.token.updatedAt, view?.token.program]);

  const saveFees = async () => {
    if (!view || !tax || !settings || !actor) return;
    const chain = taxFromSettings(view.token.program, settings);
    const err = taxAdjustValid(tax, view.token.program, chain);
    if (err) {
      setTaxTx(null);
      setTaxMsg(err);
      return;
    }
    const plan = taxSavePlan(tax, view.token.program, chain, actor);
    if (!plan.fees && !plan.channels) {
      setTaxTx(null);
      setTaxMsg("No tax changes to sign.");
      return;
    }
    const actions: ChainAction[] = [];
    if (plan.fees) {
      actions.push(
        setfeesAction(
          view.token.contract,
          view.token.precision,
          view.token.symbol,
          {
            reflectionRate: tax.reflectionRate,
            burnRate: tax.burnRate,
            projectRate: tax.projectRate,
            projectAccount: tax.projectAccount,
          },
          hasProjectTax(view.token.program),
          actor
        )
      );
    }
    if (plan.channels) {
      actions.push(ratiosAction(view.token.contract, view.token.symbol, tax.angelNumbersBps, tax.jackpotBps));
    }
    setTaxBusy(true);
    setTaxMsg("");
    setTaxTx(null);
    try {
      const res = await transact(actions);
      const tx = txIdFromResult(res) || "ok";
      setTaxMsg("");
      setTaxTx({ label: plan.channels && plan.fees ? "Saved tax and channels" : plan.channels ? "Saved channels" : "Saved tax", id: tx });
      const row = await readSettings(view.token.contract, view.token.symbol);
      setSettings(row);
      setTax(taxFromSettings(view.token.program, row));
      const saved = await upsertManagerToken({
        ...view.token,
        reflectionRate: tax.reflectionRate,
        burnRate: tax.burnRate,
        projectRate: tax.projectRate,
        projectAccount: tax.projectAccount,
        feesTx: tx,
        updatedAt: Date.now(),
      }).catch(() => null);
      if (saved) {
        setViews((prev) =>
          (prev ?? []).map((v) =>
            managerTokenKey(v.token.contract, v.token.symbol) === managerTokenKey(saved.contract, saved.symbol)
              ? { ...v, token: { ...v.token, ...saved } }
              : v
          )
        );
      }
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setTaxMsg(hint ? `${text} - ${hint}` : text);
    } finally {
      setTaxBusy(false);
    }
  };


  const onLogo = async (file?: File) => {
    if (!file || !view || !meta || !actor || ipfsCid(meta.imageUrl)) return;
    const problem = await validateTokenLogo(file);
    if (problem) {
      setSaveMsg(problem);
      return;
    }
    try {
      const pinned = await pinLogoFile(file);
      const next = { ...meta, imageUrl: pinned.url };
      setMeta(next);
      void storeLogoFile(view.token.contract, view.token.symbol, pinned.cid, file);
      const clean = sanitizeManagerMeta(next);
      if (typeof clean === "string") return;
      const saved = await upsertManagerToken(applyManagerMeta(view.token, clean));
      setViews((prev) =>
        (prev ?? []).map((v) =>
          managerTokenKey(v.token.contract, v.token.symbol) === managerTokenKey(saved.contract, saved.symbol)
            ? { ...v, token: { ...v.token, ...saved } }
            : v
        )
      );
    } catch {
      /* quiet */
    }
  };

  const save = async () => {
    if (!view || !meta || !actor) return;
    const clean = sanitizeManagerMeta(meta);
    if (typeof clean === "string") {
      setSaveMsg(clean);
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const saved = await upsertManagerToken(applyManagerMeta(view.token, clean));
      setViews((prev) =>
        (prev ?? []).map((v) =>
          managerTokenKey(v.token.contract, v.token.symbol) === managerTokenKey(saved.contract, saved.symbol)
            ? { ...v, token: { ...v.token, ...saved } }
            : v
        )
      );
      setSaveMsg("Saved in this app. Use Wallet and Alcor listing below to request the logo and copy the Alcor prompt.");
    } catch (err) {
      setSaveMsg(txErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveRainDefaults = async () => {
    if (!view) return;
    setRainSaving(true);
    setRainSaveMsg("");
    try {
      const saved = await upsertManagerToken({
        ...view.token,
        rainMinHold: rain.rainMinHold,
        rainMinPool: rain.rainMinPool,
        updatedAt: Date.now(),
      });
      setViews((prev) =>
        (prev ?? []).map((v) =>
          managerTokenKey(v.token.contract, v.token.symbol) === managerTokenKey(saved.contract, saved.symbol)
            ? { ...v, token: { ...v.token, ...saved } }
            : v
        )
      );
      setRainSaveMsg("Saved. Make it rain in this app uses these floors.");
    } catch (err) {
      setRainSaveMsg(txErrorMessage(err));
    } finally {
      setRainSaving(false);
    }
  };

  const makeItRain = async () => {
    if (!view || !actor || view.inProgress) return;
    setRaining(true);
    setRainMsg("");
    setRainTx("");
    try {
      const res = await transact([
        payoutAction(
          view.token.contract,
          view.token.symbol,
          actor,
          flexMeta(view.token.program).payoutSigner,
          rain
        ),
      ]);
      setRainTx(txIdFromResult(res) || "ok");
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setRainMsg(hint ? `${text} - ${hint}` : text);
    } finally {
      setRaining(false);
    }
  };

  const continueLaunch = () => {
    if (!view) return;
    writeLaunchDraft(draftFromManager(view.token));
    try {
      sessionStorage.setItem(MANAGER_RESUME_KEY, "1");
    } catch {
      /* ignore */
    }
    navigate("/launch");
  };

  const issued = useMemo(
    () => (views ?? []).map((v) => ({ contract: v.token.contract, symbol: v.token.symbol, precision: v.token.precision })),
    [views]
  );

  const checking = Boolean(isLoggedIn && actor && views == null);
  const started = Boolean(isLoggedIn && actor && views != null && managerHasStarted(views));
  const toolTitle = started ? undefined : checking ? "Checking this account." : "Opens after this account creates a token.";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <h1 className="text-3xl font-black tracking-tight">Dev Tools</h1>
        <WinnerTextLink label="Metadata" active={started && tool === "meta"} disabled={!started} title={toolTitle} onClick={() => setTool("meta")} />
        <WinnerTextLink label="Adjust Tax" active={started && tool === "tax"} disabled={!started} title={toolTitle} onClick={() => setTool("tax")} />
        <WinnerTextLink label="Airdrop" active={tool === "airdrop"} onClick={() => setTool("airdrop")} />
        <WinnerTextLink label="Presale" active={started && tool === "presale"} disabled={!started} title={toolTitle} onClick={() => setTool("presale")} />
      </div>

      {tool === "airdrop" ? (
        <>
          {isLoggedIn && actor ? (
            <button
              type="button"
              className="mt-3 text-left text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={busy}
              onClick={() => void load()}
            >
              {busy ? "Loading…" : "Refresh"}
            </button>
          ) : null}
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          <AirdropPanel actor={actor || ""} issued={issued} transact={transact} onConnect={() => void addWebAuthWallet()} />
        </>
      ) : !isLoggedIn || !actor ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect the issuer account that already signed create. Metadata, tax, and presale stay inactive until that account has a token.
          </p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => void addWebAuthWallet()}>
            Connect Wallet
          </button>
        </>
      ) : (
      <>
      <button
        type="button"
        className="mt-3 text-left text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Loading…" : "Refresh"}
      </button>

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

      {views == null ? (
        <ManagerSkeleton />
      ) : !started ? (
        <div className="card mt-2 p-6">
          <p className="text-sm text-muted-foreground">
            Token links turn on after your first on-chain create. Start on the Launch page, then come back from any device
            with this account.
          </p>
          <Link to="/launch" className="btn btn-primary mt-4 inline-flex">
            Go to Launch
          </Link>
        </div>
      ) : tool === "presale" && view ? (
        <section className="card mt-2 space-y-5 p-6">
          <div>
            <p className="font-mono text-lg font-bold">${view.token.symbol}</p>
            <p className="text-xs text-muted-foreground">
              {view.token.program} @ {view.token.contract}
            </p>
          </div>
          {views.length > 1 ? (
            <ul className="space-y-2">
              {views.map((v) => {
                const key = managerTokenKey(v.token.contract, v.token.symbol);
                const on = key === selected;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelected(key)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                        on ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                      }`}
                    >
                      <TokenIcon contract={v.token.contract} symbol={v.token.symbol} src={v.token.imageUrl} size={36} rounded="xl" />
                      <span className="min-w-0 flex-1 font-mono text-sm font-bold">
                        {v.token.symbol} <span className="text-muted-foreground">@ {v.token.contract}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ManagerPresale contract={view.token.contract} symbol={view.token.symbol} actor={actor} transact={transact} />
        </section>
      ) : (
        <>
          {views.length > 1 ? (
            <ul className="mt-2 space-y-2">
              {views.map((v) => {
                const key = managerTokenKey(v.token.contract, v.token.symbol);
                const on = key === selected;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelected(key)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                        on ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                      }`}
                    >
                      <TokenIcon contract={v.token.contract} symbol={v.token.symbol} src={v.token.imageUrl} size={36} rounded="xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-bold">
                          {v.token.name || v.token.symbol}{" "}
                          <span className="text-muted-foreground">${v.token.symbol}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.token.program} @ {v.token.contract} ·{" "}
                          {v.chain && !v.chain.launched && v.chain.poolId
                            ? "insiders"
                            : v.inProgress
                              ? v.next.label
                              : "live"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {view && meta ? (
            <section className={`card space-y-5 p-6 ${views.length > 1 ? "mt-6" : "mt-2"}`}>
              <div className="flex items-start gap-4">
                <TokenIcon contract={view.token.contract} symbol={view.token.symbol} src={meta.imageUrl} size={64} rounded="xl" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-lg font-bold">${view.token.symbol}</p>
                    {!view.inProgress ? (
                      <button
                        type="button"
                        className="btn-rain btn-sm"
                        disabled={raining || busy}
                        onClick={() => void makeItRain()}
                      >
                        {raining ? "Signing…" : "Make it rain"}
                      </button>
                    ) : null}
                  </div>
                  {rainTx ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Make it rain · <TxLink tx={rainTx} />
                    </p>
                  ) : rainMsg ? (
                    <p className="mt-1 text-xs text-muted-foreground">{rainMsg}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {view.token.precision} decimals · {view.token.program} @ {view.token.contract}
                    {view.token.maxSupply ? ` · max ${formatManagerSupply(view.token.maxSupply)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Ticker, precision, and program are fixed on chain.</p>
                </div>
              </div>

              {tool === "meta" ? (
              <>
              <Field label="Display name" hint={`Max ${TOKEN_PROTON_TNAME_MAX} characters (token.proton).`}>
                <input
                  className="input"
                  maxLength={TOKEN_PROTON_TNAME_MAX}
                  value={meta.name}
                  onChange={(e) => setMeta({ ...meta, name: e.target.value.slice(0, TOKEN_PROTON_TNAME_MAX) })}
                />
              </Field>
              <Field label="Description">
                <textarea
                  className="input min-h-[88px] resize-y"
                  value={meta.description}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Website">
                  <input
                    className="input"
                    placeholder="https://"
                    value={meta.website}
                    onChange={(e) => setMeta({ ...meta, website: e.target.value })}
                  />
                </Field>
                <Field label="X / Twitter">
                  <input className="input" value={meta.twitter} onChange={(e) => setMeta({ ...meta, twitter: e.target.value })} />
                </Field>
                <Field label="Telegram">
                  <input
                    className="input"
                    placeholder="t.me/channel"
                    value={meta.telegram}
                    onChange={(e) => setMeta({ ...meta, telegram: e.target.value })}
                  />
                </Field>
                <Field label="Farcaster">
                  <input className="input" value={meta.farcaster} onChange={(e) => setMeta({ ...meta, farcaster: e.target.value })} />
                </Field>
              </div>
              <Field label="Logo" hint="Square PNG or SVG, or paste an image link.">
                {ipfsCid(meta.imageUrl) ? null : (
                  <label className="btn btn-outline btn-sm mb-2 inline-flex cursor-pointer">
                    Upload logo
                    <input
                      type="file"
                      accept="image/png,image/svg+xml"
                      className="sr-only"
                      onChange={(e) => void onLogo(e.target.files?.[0])}
                    />
                  </label>
                )}
                <input
                  className="input font-mono text-xs"
                  placeholder="https://"
                  value={meta.imageUrl}
                  onChange={(e) => setMeta({ ...meta, imageUrl: e.target.value })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save metadata"}
                </button>
                {view.inProgress ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={continueLaunch}>
                    Continue launch
                  </button>
                ) : (
                  <Link to={`/token/${view.token.contract}/${view.token.symbol}`} className="btn btn-outline btn-sm">
                    Open token
                  </Link>
                )}
              </div>
              {saveMsg ? <p className="text-xs text-muted-foreground">{saveMsg}</p> : null}

              <TokenListingCard
                key={`${managerTokenKey(view.token.contract, view.token.symbol)}:${view.token.updatedAt}`}
                contract={view.token.contract}
                symbol={view.token.symbol}
                precision={view.token.precision}
                actor={actor}
                transact={transact}
              />

              <div className="space-y-3 border-t border-border pt-5">
                <RainDefaultsFields
                  key={managerTokenKey(view.token.contract, view.token.symbol)}
                  value={rain}
                  precision={view.token.precision}
                  symbol={view.token.symbol}
                  onChange={setRain}
                  disabled={rainSaving || busy}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={rainSaving || busy || !view.token.createTx}
                  onClick={() => void saveRainDefaults()}
                >
                  {rainSaving ? "Saving…" : "Save reflection minimums"}
                </button>
                {rainSaveMsg ? <p className="text-xs text-muted-foreground">{rainSaveMsg}</p> : null}
              </div>
              </>
              ) : null}

              {tool === "tax" ? (
              tax && settings ? (
                <div className="space-y-3 border-t border-border pt-5">
                  {(() => {
                    const chainTax = taxFromSettings(view.token.program, settings);
                    const plan = taxSavePlan(tax, view.token.program, chainTax, actor ?? "");
                    const label = plan.fees && plan.channels ? "Save tax and channels" : plan.channels ? "Save reflection channels" : "Save tax";
                    return (
                      <>
                  <TaxBucketsForm
                    program={view.token.program}
                    value={tax}
                    chain={chainTax}
                    actor={actor ?? ""}
                    disabled={taxBusy || busy}
                    onChange={setTax}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={taxBusy || busy || Boolean(taxAdjustValid(tax, view.token.program, chainTax)) || (!plan.fees && !plan.channels)}
                      onClick={() => void saveFees()}
                    >
                      {taxBusy ? "Signing…" : label}
                    </button>
                  </div>
                      </>
                    );
                  })()}
                  {taxTx ? (
                    <p className="text-xs text-muted-foreground">
                      {taxTx.label} · <TxLink tx={taxTx.id} />
                    </p>
                  ) : taxMsg ? (
                    <p className="text-xs text-muted-foreground">{taxMsg}</p>
                  ) : null}
                </div>
              ) : view.progress.create ? (
                <FormPanelSkeleton />
              ) : (
                <p className="text-sm text-muted-foreground">Set fees after create.</p>
              )
              ) : null}

              {tool === "meta" ? (
              <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Launch steps</p>
                <ol className="mt-2 space-y-1.5">
                  {LAUNCH_STEP_IDS.map((id) => {
                    const done = view.progress[id];
                    const current = view.next.id === id;
                    return (
                      <li key={id} className="flex items-center gap-2 text-xs">
                        <StatusIcon state={done ? "done" : current ? "active" : "todo"} />
                        <span className={done ? "text-muted-foreground" : current ? "text-foreground font-medium" : "text-muted-foreground"}>
                          {LAUNCH_STEPS[id].label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next step</p>
                <p className="mt-1 text-sm font-semibold">{view.next.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{view.next.prompt}</p>
                {view.chain && !view.chain.launched && view.chain.poolId ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to={`/token/${view.token.contract}/${view.token.symbol}`}
                      className="btn btn-outline btn-sm"
                    >
                      Open token page
                    </Link>
                    <button
                      type="button"
                      className="btn btn-accent btn-sm"
                      disabled={busy || !actor}
                      onClick={() => {
                        if (!actor) return;
                        setBusy(true);
                        setError("");
                        void transact([goliveAction(view.token.contract, view.token.symbol)])
                          .then(() => load())
                          .catch((err) => {
                            const text = txErrorMessage(err);
                            const hint = hintForError(text);
                            setError(hint ? `${text} - ${hint}` : text);
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Launch
                    </button>
                  </div>
                ) : null}
              </div>
              </>
              ) : null}
            </section>
          ) : null}
        </>
      )}
      </>
      )}
    </div>
  );
}
