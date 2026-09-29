import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalTokenCard } from "@/components/events/CalTokenCard";
import { TokenMonthCalendar } from "@/components/cal/TokenMonthCalendar";
import { TokenGlyph } from "@/components/TokenGlyph";
import { TokenTile } from "@/components/token/TokenTile";
import { clubDateEvents, dayKey, loadCalendarEvents, type CalEvent } from "@/services/launchEvents";
import { loadBoardTokens, type BoardToken } from "@/services/leaderboardStore";
import { alcorAnalyticsUrl } from "@/config/launch";
import type { LaunchRoom } from "@/services/mechanicsLive";
import { EventsSkeleton, TilesRowSkeleton } from "@/components/ui/PageSkeletons";
import {
  calendarTokenMarks,
  calTokenKey,
  fromCalEvents,
  type TokenCalEvent,
} from "@/components/cal/tokenCalEvents";

function asCalEvent(ev: TokenCalEvent): CalEvent {
  return {
    id: ev.id,
    kind: ev.kind === "insider" ? "presale" : "launch",
    at: ev.launchAt.getTime(),
    contract: ev.contract,
    symbol: ev.symbol,
    program: ev.program,
    quoteSymbol: ev.quoteSymbol,
    quoteContract: ev.quoteContract,
    poolId: 0,
  };
}

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
  const [board, setBoard] = useState<BoardToken[]>([]);
  const [histPick, setHistPick] = useState<BoardToken | null>(null);
  const [histBusy, setHistBusy] = useState(false);
  const [histErr, setHistErr] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "some" | "only">("all");
  const [someKeys, setSomeKeys] = useState<Set<string> | null>(null);
  const [onlyKey, setOnlyKey] = useState<string | null>(null);

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
    void loadBoardTokens()
      .then((rows) => {
        if (live) setBoard(rows);
      })
      .catch(() => {
        if (live) setBoard([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const tokenEvents = useMemo(
    () => fromCalEvents(clubDateEvents(events), board),
    [events, board]
  );
  const marks = useMemo(() => calendarTokenMarks(tokenEvents), [tokenEvents]);
  const lit = useMemo(() => {
    const all = new Set(marks.map((m) => m.key));
    if (filterMode === "all") return all;
    if (filterMode === "only") return onlyKey && all.has(onlyKey) ? new Set([onlyKey]) : new Set<string>();
    if (someKeys == null) return all;
    return new Set([...someKeys].filter((key) => all.has(key)));
  }, [filterMode, marks, someKeys, onlyKey]);
  const shownEvents = useMemo(
    () => tokenEvents.filter((ev) => lit.has(calTokenKey(ev))),
    [tokenEvents, lit]
  );
  const monthList = useMemo(
    () =>
      shownEvents
        .filter((ev) => ev.launchAt.getFullYear() === year && ev.launchAt.getMonth() === month)
        .sort((a, b) => a.launchAt.getTime() - b.launchAt.getTime()),
    [shownEvents, year, month]
  );

  const quoteOnView = () => {
    const ev = tokenEvents.find((row) => row.launchAt.getFullYear() === year && row.launchAt.getMonth() === month);
    return ev ? calTokenKey(ev) : marks[0]?.key;
  };

  const toggleMark = (key: string) => {
    if (filterMode === "only") {
      setOnlyKey(key);
      return;
    }
    const next = new Set(filterMode === "all" || someKeys == null ? marks.map((m) => m.key) : someKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size === marks.length) {
      setFilterMode("all");
      return;
    }
    setSomeKeys(next);
    setFilterMode("some");
  };

  const toggleMode = () => {
    if (filterMode === "all") {
      setFilterMode("some");
      return;
    }
    if (filterMode === "some") {
      setOnlyKey((prev) => (prev && marks.some((m) => m.key === prev) ? prev : (quoteOnView() ?? null)));
      setFilterMode("only");
      return;
    }
    setFilterMode("all");
  };
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
      {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

      {busy ? (
        <EventsSkeleton />
      ) : (
        <>
      <div className="mt-8">
        <TokenMonthCalendar
          year={year}
          month={month}
          events={shownEvents}
          marks={marks}
          lit={lit}
          mode={filterMode}
          onToggleMark={toggleMark}
          onToggleMode={toggleMode}
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
              <CalTokenCard key={ev.id} ev={asCalEvent(ev)} picked={dayKey(ev.launchAt.getTime()) === picked} />
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
                <Link className="btn btn-outline btn-sm" to={`/token/${r.contract}/${r.symbol}`}>
                  Token
                </Link>
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
          histBusy ? (
            <TilesRowSkeleton />
          ) : (
          <button type="button" className="btn btn-outline" disabled={histBusy} onClick={loadHistory}>
            Launch History
          </button>
          )
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
        </>
      )}
    </div>
  );
}
