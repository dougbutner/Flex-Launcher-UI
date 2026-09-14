import { useEffect, useState } from "react";
import { TokenTile } from "@/components/token/TokenTile";
import {
  BOARD_SECTION_LIMIT,
  loadBoardTokens,
  sortLargeCap,
  sortLoudest,
  sortNewcomers,
  sortPopular,
  type BoardToken,
} from "@/services/leaderboardStore";
import { loadProtonTokenTable } from "@/services/tokenProton";

function Section({ title, tokens }: { title: string; tokens: BoardToken[] }) {
  if (!tokens.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tokens.slice(0, BOARD_SECTION_LIMIT).map((t) => (
          <TokenTile
            key={`${title}:${t.id}`}
            program={t.program}
            contract={t.contract}
            symbol={t.symbol}
            quoteContract={t.quoteContract}
            quoteSymbol={t.quoteSymbol}
            mcapUsd={t.mcapUsd}
            liqUsd={t.liqUsd}
          />
        ))}
      </div>
    </section>
  );
}

export default function Leaderboard() {
  const [tokens, setTokens] = useState<BoardToken[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    void loadProtonTokenTable().catch(() => []);
    loadBoardTokens()
      .then((rows) => {
        if (!live) return;
        setTokens(rows);
      })
      .catch((e) => {
        if (!live) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/retrieve account|unknown key|not.*live/i.test(msg)) {
          setTokens([]);
          setNotice("Flex contracts are not live yet. Launches will appear here after the first liftoff.");
        } else {
          setError(msg);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Winners</h1>

      {notice ? (
        <p className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : tokens == null ? (
        <p className="mt-6 text-sm text-muted-foreground">Reading launches…</p>
      ) : tokens.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm text-muted-foreground">
          No live launches yet. Be the first. Hit the Launch wizard.
        </div>
      ) : (
        <>
          <Section title="Newcomers" tokens={sortNewcomers(tokens)} />
          <Section title="Loudest" tokens={sortLoudest(tokens)} />
          <Section title="Large Cap" tokens={sortLargeCap(tokens)} />
          <Section title="Popular" tokens={sortPopular(tokens)} />
        </>
      )}
    </div>
  );
}
