import { TokenIcon } from "@/components/TokenIcon";
import { eventsByDay, type CalEvent } from "@/services/launchEvents";
import { useMemo } from "react";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_ICONS = 3;

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function cellsFor(year: number, month: number) {
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

export function DropCalendar({
  year,
  month,
  events,
  picked,
  onPick,
  onShift,
}: {
  year: number;
  month: number;
  events: CalEvent[];
  picked: string;
  onPick: (key: string) => void;
  onShift: (delta: number) => void;
}) {
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const cells = useMemo(() => cellsFor(year, month), [year, month]);
  const today = ymd(new Date());

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShift(-1)}>
          Prev
        </button>
        <h2 className="text-sm font-semibold uppercase tracking-widest">{monthLabel(year, month)}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShift(1)}>
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
          const unique = [
            ...new Map(list.map((ev) => [`${ev.contract}:${ev.symbol}`, ev] as const)).values(),
          ];
          return (
            <button
              key={key + String(inMonth)}
              type="button"
              className={`tetra-cal__cell ${inMonth ? "" : "is-muted"} ${key === today ? "is-today" : ""} ${
                list.length ? "is-on" : ""
              } ${key === picked ? "is-picked" : ""}`}
              onClick={() => onPick(key)}
            >
              <span className="font-mono text-sm">{date.getDate()}</span>
              {unique.length ? (
                <span className="tetra-cal__icons">
                  {unique.slice(0, MAX_ICONS).map((ev) => (
                    <TokenIcon
                      key={`${ev.kind}:${ev.contract}:${ev.symbol}`}
                      contract={ev.contract}
                      symbol={ev.symbol}
                      size={16}
                    />
                  ))}
                  {unique.length > MAX_ICONS ? (
                    <span className="tetra-cal__more">+{unique.length - MAX_ICONS}</span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
