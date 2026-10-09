import { useCallback, useEffect, useState } from "react";
import { TxLink } from "@/components/launch/ui";
import { readFlexers } from "@/services/flexTables";
import { issuerTaxStatusActions, type ChainAction } from "@/services/launchActions";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

type Row = { owner: string; out: boolean };

function pickOwner(row: Record<string, unknown>): string {
  return String(row.owner ?? row.account ?? "").trim();
}

function optedOut(row: Record<string, unknown>): boolean {
  const v = row.fee_opted_out ?? row.is_banned;
  return v === true || v === 1 || v === "1";
}

export function HolderTaxPanel(props: {
  contract: string;
  symbol: string;
  precision: number;
  issuer: string;
  disabled: boolean;
  transact: (actions: ChainAction[]) => Promise<unknown>;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState("");
  const [signing, setSigning] = useState(false);
  const [msg, setMsg] = useState("");
  const [tx, setTx] = useState("");

  const load = useCallback(async () => {
    const live = await readFlexers(props.contract, props.symbol, 2000);
    const next = live
      .map((row) => ({ owner: pickOwner(row), out: optedOut(row) }))
      .filter((row) => row.owner)
      .sort((a, b) => a.owner.localeCompare(b.owner));
    setRows(next);
    setSelected((cur) => (next.some((row) => row.owner === cur) ? cur : ""));
  }, [props.contract, props.symbol]);

  useEffect(() => {
    let gone = false;
    setRows(null);
    setSelected("");
    setMsg("");
    setTx("");
    void load().catch(() => {
      if (!gone) setRows([]);
    });
    return () => {
      gone = true;
    };
  }, [load]);

  const out = (rows ?? []).filter((row) => row.out);
  const inn = (rows ?? []).filter((row) => !row.out);
  const pick = (rows ?? []).find((row) => row.owner === selected);

  const send = async () => {
    if (!pick || !props.issuer) return;
    setSigning(true);
    setMsg("");
    setTx("");
    try {
      const res = await props.transact(
        issuerTaxStatusActions(props.contract, props.issuer, pick.owner, !pick.out, props.symbol, props.precision)
      );
      setTx(txIdFromResult(res) || "ok");
      await load();
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg(hint ? `${text} - ${hint}` : text);
    } finally {
      setSigning(false);
    }
  };

  const list = (title: string, items: Row[]) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {rows == null ? (
        <div className="mt-2 space-y-1.5" aria-hidden>
          <div className="h-8 animate-pulse bg-muted" />
          <div className="h-8 animate-pulse bg-muted" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No accounts here.</p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {items.map((row) => (
            <li key={row.owner}>
              <button
                type="button"
                className={`w-full px-2 py-1.5 text-left font-mono text-xs ${
                  selected === row.owner ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                disabled={props.disabled || signing}
                onClick={() => setSelected(row.owner)}
              >
                {row.owner}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <p className="text-sm font-semibold">Holder tax</p>
      <p className="text-xs text-muted-foreground">
        Pick an account, then switch their tax. They receive the smallest amount with a note naming you.
      </p>
      {list("Opted out", out)}
      {list("Opted in", inn)}
      {pick ? (
        <button type="button" className="btn btn-outline btn-sm" disabled={props.disabled || signing} onClick={() => void send()}>
          {signing ? "Signing…" : pick.out ? `Opt in ${pick.owner}` : `Opt out ${pick.owner}`}
        </button>
      ) : null}
      {tx ? (
        <p className="text-xs text-muted-foreground">
          Updated · <TxLink tx={tx} />
        </p>
      ) : msg ? (
        <p className="text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </div>
  );
}
