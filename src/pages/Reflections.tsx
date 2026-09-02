import { useCallback, useEffect, useState } from "react";
import { explorerTx, FLEXFOREX_CONTRACT } from "@/config/launch";
import { getActions, type HyperionAction } from "@/services/rpc";

const PAGE = 25;

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
  const [actions, setActions] = useState<HyperionAction[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (skip: number) => {
    setBusy(true);
    setError("");
    try {
      const res = await getActions({
        account: FLEXFOREX_CONTRACT,
        filter: `${FLEXFOREX_CONTRACT}:reflect`,
        limit: PAGE,
        skip,
      });
      setTotal(res.total);
      setActions((prev) => (skip === 0 ? res.actions : [...prev, ...res.actions]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Historic reflections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every <span className="font-mono">reflect</span> call on{" "}
            <span className="font-mono">{FLEXFOREX_CONTRACT}</span> — skim first, then the 61.8% splash to holders.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load(0)}>
          {busy && actions.length === 0 ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 space-y-2">
        {actions.length === 0 && !busy ? (
          <div className="card p-8 text-center text-sm text-muted-foreground">
            No reflections yet. Once a token is stamped, anyone can poke <span className="font-mono">reflect</span>.
          </div>
        ) : (
          actions.map((a, i) => {
            const id = a.trx_id ?? "";
            const rows = dataSummary(a.act?.data);
            return (
              <article key={`${id}-${i}`} className="card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{ts(a)}</span>
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

      {actions.length > 0 && actions.length < total ? (
        <div className="mt-6 text-center">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void load(actions.length)}>
            {busy ? "Loading…" : `Load more (${actions.length}/${total})`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
