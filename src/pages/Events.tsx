import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TokenIcon } from "@/components/TokenIcon";
import { eventsByDay, loadCalendarEvents, type CalEvent } from "@/services/launchEvents";
import type { LaunchRoom } from "@/services/mechanicsLive";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function cellsFor(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const out: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < start; i++) {
    const d = new Date(year, month, -start + i + 1);
    out.push({ date: d, inMonth: false });
  }
  for (let day = 1; day <= days; day++) out.push({ date: new Date(year, month, day), inMonth: true });
  while (out.length % 7) {
    const last = out[out.length - 1].date;
    out.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }
  return out;
}

function kindLabel(kind: CalEvent["kind"]) {
  return kind === "liftoff" ? "Liftoff" : "LP unlock";
}

export default function Events() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [picked, setPicked] = useState(ymd(now));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [rooms, setRooms] = useState<LaunchRoom[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

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

  const byDay = useMemo(() => eventsByDay(events), [events]);
  const cells = useMemo(() => cellsFor(year, month), [year, month]);
  const dayEvents = byDay.get(picked) ?? [];
  const open = rooms.filter((r) => !r.launched);
  const today = ymd(now);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Events</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Liftoff days from live Alcor pools, plus LP unlock times from each launch row. Open wizard tokens sit beside the
        month until they lift off.
      </p>

      {busy ? <p className="mt-6 text-sm text-muted-foreground">Reading launches…</p> : null}
      {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => shift(-1)}>
          Prev
        </button>
        <h2 className="text-sm font-semibold uppercase tracking-widest">{monthLabel(year, month)}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => shift(1)}>
          Next
        </button>
      </div>

      <div className="tetra-cal mt-4">
        {DOW.map((d) => (
          <div key={d} className="tetra-cal__dow">
            {d}
          </div>
        ))}
        {cells.map(({ date, inMonth }) => {
          const key = ymd(date);
          const list = byDay.get(key) ?? [];
          const kinds = new Set(list.map((e) => e.kind));
          return (
            <button
              key={key + String(inMonth)}
              type="button"
              className={`tetra-cal__cell ${inMonth ? "" : "is-muted"} ${key === today ? "is-today" : ""} ${
                list.length ? "is-on" : ""
              } ${key === picked ? "is-picked" : ""}`}
              onClick={() => setPicked(key)}
            >
              <span className="font-mono text-sm">{date.getDate()}</span>
              {list.length ? (
                <span className="tetra-cal__dots">
                  {kinds.has("liftoff") ? <span className="tetra-cal__dot" /> : null}
                  {kinds.has("unlock") ? <span className="tetra-cal__dot is-unlock" /> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{picked}</h2>
        {dayEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing on this day yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border border border-border">
            {dayEvents.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                <div className="flex items-center gap-3">
                  <TokenIcon contract={ev.contract} symbol={ev.symbol} size={28} />
                  <div>
                    <div className="font-mono text-sm">${ev.symbol}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {kindLabel(ev.kind)} · {ev.program} · {ev.quoteSymbol || "quote"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link className="btn btn-outline btn-sm" to={`/token/${ev.contract}/${ev.symbol}`}>
                    Token
                  </Link>
                  <Link className="btn btn-ghost btn-sm" to={`/insiders/${ev.contract}/${ev.symbol}`}>
                    Insiders
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open.length ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">In flight</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Started on chain, not lifted off. Pre-launch Insiders rooms land here later.
          </p>
          <ul className="mt-3 divide-y divide-border border border-border">
            {open.map((r) => (
              <li key={`${r.contract}:${r.symbol}`} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="flex items-center gap-3">
                  <TokenIcon contract={r.contract} symbol={r.symbol} size={28} />
                  <span className="font-mono text-sm">${r.symbol}</span>
                </div>
                <Link className="btn btn-ghost btn-sm" to="/launch">
                  Wizard
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
