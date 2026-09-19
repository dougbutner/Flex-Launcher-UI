import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalTokenCard } from "@/components/events/CalTokenCard";
import { DropCalendar } from "@/components/events/DropCalendar";
import { TokenGlyph } from "@/components/TokenGlyph";
import { TokenTile } from "@/components/token/TokenTile";
import {
  clubDateEvents,
  dayKey,
  loadCalendarEvents,
  monthEvents,
  type CalEvent,
} from "@/services/launchEvents";
import { loadBoardTokens, type BoardToken } from "@/services/leaderboardStore";
import { alcorAnalyticsUrl } from "@/config/launch";
import type { LaunchRoom } from "@/services/mechanicsLive";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarPanel({ title = "Drop Calendar" }: { title?: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [picked, setPicked] = useState(ymd(now));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [rooms, setRooms] = useState<LaunchRoom[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [history, setHistory] = useState<BoardToken[] | null>(null);
  const [histPick, setHistPick] = useState<BoardToken | null>(null);
  const [histBusy, setHistBusy] = useState(false);
  const [histErr, setHistErr] = useState("");

  useEffect(() => {
    let live = true;
    loadCalendarEvents()
      .then((res) => {
        if (!live) return;
        setEvents(res.events);
        setRooms(res.rooms);
      })
      .catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const monthList = useMemo(() => monthEvents(clubDateEvents(events), year, month), [events, year, month]);
  const calEvents = useMemo(() => clubDateEvents(events), [events]);
  const open = rooms.filter((r) => r.program !== "core" && !r.launched && r.poolId > 0);
  const inFlight = rooms.filter((r) => r.program !== "core" && !r.launched && r.poolId <= 0);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const loadHistory = () => {
    if (histBusy) return;
    setHistBusy(true);
    setHistErr("");
    loadBoardTokens()
      .then((rows) => {
        const launched = rows.filter((t) => t.poolId > 0).sort((a, b) => b.firstSeenAt - a.firstSeenAt);
        setHistory(launched);
        setHistPick(launched[0] ?? null);
      })
      .catch((e) => {
        setHistErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setHistBusy(false);
      });
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      {busy ? <p className="mt-6 text-sm text-muted-foreground">Reading launches…</p> : null}
      {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8">
        <DropCalendar
          year={year}
          month={month}
          events={calEvents}
          picked={picked}
          onPick={setPicked}
          onShift={shift}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Insiders and launches
        </h2>
        {monthList.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No insider or launch dates this month.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {monthList.map((ev) => (
              <CalTokenCard key={ev.id} ev={ev} picked={dayKey(ev.at) === picked} />
            ))}
          </div>
        )}
      </section>

      {open.length ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Open club windows</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pool is filled. Public transfers wait until launch. Chat is open for holders and on-chain insiders.
          </p>
          <ul className="mt-3 divide-y divide-border border border-border">
            {open.map((r) => (
              <li key={`${r.contract}:${r.symbol}`} className="flex items-center justify-between gap-3 px-3 py-3">
                <TokenGlyph contract={r.contract} symbol={r.symbol} />
                <div className="flex gap-2">
                  <Link className="btn btn-outline btn-sm" to={`/token/${r.contract}/${r.symbol}`}>
                    Token
                  </Link>
                  <Link className="btn btn-ghost btn-sm" to={`/insiders/${r.contract}/${r.symbol}`}>
                    Chat
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inFlight.length ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">In flight</h2>
          <p className="mt-2 text-sm text-muted-foreground">Started on chain, not locked yet. Finish the wizard.</p>
          <ul className="mt-3 divide-y divide-border border border-border">
            {inFlight.map((r) => (
              <li key={`${r.contract}:${r.symbol}`} className="flex items-center justify-between gap-3 px-3 py-3">
                <TokenGlyph contract={r.contract} symbol={r.symbol} />
                <Link className="btn btn-ghost btn-sm" to="/launch">
                  Wizard
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 border-t border-border pt-8">
        {history == null ? (
          <button type="button" className="btn btn-outline" disabled={histBusy} onClick={loadHistory}>
            {histBusy ? "Reading Alcor…" : "Launch History"}
          </button>
        ) : (
          <>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Launch History</h2>
            <p className="mt-2 text-sm text-muted-foreground">Past drops from Alcor pool data. Pick one to open Alcor analytics.</p>
            {histErr ? <p className="mt-3 text-sm text-destructive">{histErr}</p> : null}
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No launched pools on Alcor yet.</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {history.map((t) => (
                    <div key={t.id} className={histPick?.id === t.id ? "ring-1 ring-primary" : ""}>
                      <TokenTile
                        program={t.program}
                        contract={t.contract}
                        symbol={t.symbol}
                        quoteContract={t.quoteContract}
                        quoteSymbol={t.quoteSymbol}
                        mcapUsd={t.mcapUsd}
                        liqUsd={t.liqUsd}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm mt-1 w-full"
                        onClick={() => setHistPick(t)}
                      >
                        Alcor
                      </button>
                    </div>
                  ))}
                </div>
                {histPick ? (
                  <iframe
                    title={`${histPick.symbol} Alcor analytics`}
                    src={alcorAnalyticsUrl(histPick.symbol, histPick.contract)}
                    className="mt-4 h-[520px] w-full border border-border bg-background"
                    allow="clipboard-write"
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
