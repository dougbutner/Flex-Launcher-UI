import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TokenEventChip } from "@/components/cal/TokenEventChip";
import { useMonthDays, WEEKDAY_LABELS } from "@/components/cal/useMonthDays";
import type { TokenCalEvent } from "@/components/cal/tokenCalEvents";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TokenMonthCalendar({
  year,
  month,
  events,
  picked,
  onPick,
  onShift,
}: {
  year: number;
  month: number;
  events: TokenCalEvent[];
  picked?: string;
  onPick?: (key: string) => void;
  onShift: (delta: number) => void;
}) {
  const { date, days, weekCount } = useMonthDays(year, month);
  const today = new Date();
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; width: number } | null>(null);

  const expanded = events.find((e) => e.id === expandedId) ?? null;

  const close = () => {
    setExpandedId(null);
    setAnchor(null);
  };

  useEffect(() => {
    close();
  }, [year, month]);

  useEffect(() => {
    if (!expandedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDoc = (e: MouseEvent) => {
      const node = e.target as HTMLElement | null;
      if (node?.closest("[data-cal-expanded]")) return;
      if (node?.closest("[data-cal-chip]")) return;
      if (node?.closest("[data-cal-nav]")) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [expandedId]);

  const openChip = (event: TokenCalEvent, el: HTMLElement) => {
    if (expandedId === event.id) {
      close();
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    const b = body.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    const width = Math.min(288, Math.max(240, b.width * 0.28));
    const rel = Math.max(0, c.left - b.left);
    const roomRight = b.width - rel;
    const left = roomRight >= width + 8 ? rel : Math.max(8, b.width - width - 8);
    setAnchor({ left, width });
    setExpandedId(event.id);
  };

  const byDay = useMemo(() => {
    const map = new Map<string, TokenCalEvent[]>();
    for (const ev of events) {
      const key = ymd(ev.launchAt);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.launchAt.getTime() - b.launchAt.getTime());
    return map;
  }, [events]);

  return (
    <div ref={rootRef} className="flex h-[min(72vh,760px)] flex-col overflow-x-clip border border-[#27272a] bg-background">
      <div className="flex items-center justify-between border-b border-[#27272a] px-2 py-2" data-cal-nav>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShift(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-sm font-semibold uppercase tracking-widest">{format(date, "MMMM yyyy")}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onShift(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-[#27272a]">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="border-r border-[#27272a] px-2 py-1.5 text-sm text-muted-foreground last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      <div ref={bodyRef} className="relative min-h-0 flex-1">
        <div
          key={`${year}-${month}`}
          className="token-cal-month grid h-full grid-cols-7"
          style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
        >
          {days.map((day) => {
            const key = ymd(day);
            const inMonth = isSameMonth(day, date);
            const isToday = isSameDay(day, today);
            const dayEvents = byDay.get(key) ?? [];
            const shown = dayEvents.slice(0, 3);
            const extra = dayEvents.length - shown.length;
            return (
              <div
                key={key}
                className={`flex min-h-0 flex-col overflow-visible border-b border-r border-[#27272a] p-2 [&:nth-child(7n)]:border-r-0 ${
                  inMonth ? "" : "bg-muted/50 text-muted-foreground"
                } ${key === picked ? "bg-primary/5" : ""}`}
                onClick={() => onPick?.(key)}
              >
                <span
                  className={`mb-1 inline-flex h-6 w-6 items-center justify-center text-sm ${
                    isToday ? "rounded-full bg-primary text-background" : ""
                  }`}
                >
                  {format(day, "d")}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-1">
                  {shown.map((ev) => (
                    <TokenEventChip key={ev.id} event={ev} onToggle={(el) => el && openChip(ev, el)} />
                  ))}
                  {extra > 0 ? <span className="text-[10px] text-muted-foreground">+{extra} more</span> : null}
                </div>
              </div>
            );
          })}
        </div>

        {expanded && anchor ? (
          <div
            className="absolute top-0 z-30 h-full"
            data-cal-expanded
            style={{ left: anchor.left, width: anchor.width }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <TokenEventChip event={expanded} expanded onClose={close} onToggle={close} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
