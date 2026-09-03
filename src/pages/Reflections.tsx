import { useCallback, useEffect, useState } from "react";
import { FLEX_PROGRAMS, explorerTx, flexAccount } from "@/config/launch";
import { getActions, type HyperionAction } from "@/services/rpc";

const PAGE = 25;

type Row = HyperionAction & { contract: string; actionName: string };

function ts(a: HyperionAction): string {
  const raw = a["@timestamp"] ?? a.timestamp;
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
}

function dataSummary(data: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!data) return [];
  return Object.entries(data)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .slice(0, 6)
    .map(([k, v]) => [k, String(v)]);
}

export default function Reflections() {
  const [actions, setActions] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const pages = await Promise.all(
        FLEX_PROGRAMS.map(async (p) => {
          const account = flexAccount(p.id);
          const actionName = p.payout === "distribute" ? "distribute" : "reflect";
          const res = await getActions({
            account,
            filter: `${account}:${actionName}`,
            limit: PAGE,
            skip: 0,
          });
          return res.actions.map((a) => ({ ...a, contract: account, actionName }));
        })
      );
      const merged = pages.flat().sort((a, b) => {
        const ta = Date.parse(String(a["@timestamp"] ?? a.timestamp ?? 0));
        const tb = Date.parse(String(b["@timestamp"] ?? b.timestamp ?? 0));
        return tb - ta;
      });
      setActions(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Historic reflections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">distribute</span> on easyflex and{" "}
            <span className="font-mono">reflect</span> on complexflex / flexforex — skim first, then the 61.8% splash.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy && actions.length === 0 ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 space-y-2">
        {actions.length === 0 && !busy ? (
          <div className="card p-8 text-center text-sm text-muted-foreground">
            No payouts yet. After liftoff, anyone can poke <span className="font-mono">distribute</span> or{" "}
            <span className="font-mono">reflect</span>.
          </div>
        ) : (
          actions.map((a, i) => {
            const id = a.trx_id ?? "";
            const rows = dataSummary(a.act?.data);
            return (
              <article key={`${id}-${i}`} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{ts(a)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {a.contract}::{a.actionName}
                  </span>
                  {id ? (
                    <a href={explorerTx(id)} target="_blank" rel="noopener noreferrer" className="link font-mono text-xs">
                      {id.slice(0, 12)}…
                    </a>
                  ) : null}
                </div>
                {rows.length ? (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                    {rows.map(([k, v]) => (
                      <div key={k} className="flex items-baseline gap-1.5 text-xs">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-mono font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
