import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import { TokenEventChip } from "@/components/cal/TokenEventChip";
import { useMonthDays, WEEKDAY_LABELS } from "@/components/cal/useMonthDays";
import type { CalTokenMark, TokenCalEvent } from "@/components/cal/tokenCalEvents";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TokenMonthCalendar({
  year,
  month,
  events,
  marks,
  lit,
  mode,
  onToggleMark,
  onToggleMode,
  picked,
  onPick,
  onShift,
}: {
  year: number;
  month: number;
  events: TokenCalEvent[];
  marks: CalTokenMark[];
  lit: Set<string>;
  mode: "all" | "some" | "only";
  onToggleMark: (key: string) => void;
  onToggleMode: () => void;
  picked?: string;
  onPick?: (key: string) => void;
  onShift: (delta: number) => void;
}) {
  const { date, days, weekCount } = useMonthDays(year, month);
  const today = new Date();
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

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

  useLayoutEffect(() => {
    if (!expandedId || !anchor) return;
    const body = bodyRef.current;
    const box = body?.querySelector("[data-cal-expanded]") as HTMLElement | null;
    if (!body || !box) return;
    const pad = 8;
    const h = box.offsetHeight;
    const w = box.offsetWidth || anchor.width;
    const bh = body.clientHeight;
    const bw = body.clientWidth;
    const maxTop = Math.max(pad, bh - h - pad);
    const maxLeft = Math.max(pad, bw - w - pad);
    const top = Math.min(anchor.top, maxTop);
    const left = Math.min(anchor.left, maxLeft);
    if (top !== anchor.top || left !== anchor.left) setAnchor({ ...anchor, top, left });
  }, [expandedId, anchor]);

  const openChip = (event: TokenCalEvent, el: HTMLElement) => {
    if (expandedId === event.id) {
      close();
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    const b = body.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    const pad = 8;
    const bw = body.clientWidth;
    const bh = body.clientHeight;
    const width = Math.min(300, Math.max(248, bw * 0.28), bw - pad * 2);
    const relX = Math.max(0, c.left - b.left);
    const relY = Math.max(0, c.top - b.top);
    const left = Math.min(Math.max(pad, relX), Math.max(pad, bw - width - pad));
    const top = Math.min(Math.max(pad, relY), Math.max(pad, bh - 120));
    setAnchor({ left, top, width });
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
      {marks.length ? (
        <div className="flex items-center gap-2 border-b border-[#27272a] px-2 py-2" data-cal-nav>
          <button
            type="button"
            aria-pressed={mode === "all"}
            aria-label={
              mode === "all" ? "All quotes on. Click for some." : mode === "some" ? "Some quotes on. Click for only." : "Only one quote. Click for all."
            }
            title={
              mode === "all"
                ? "All quotes on"
                : mode === "some"
                  ? "Some quotes on"
                  : "Only one quote"
            }
            onClick={onToggleMode}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold uppercase leading-none tracking-wide ${
              mode === "all"
                ? "border-primary bg-primary/20 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.65)]"
                : mode === "some"
                  ? "border-primary/70 text-primary"
                  : "border-border text-muted-foreground"
            }`}
          >
            {mode === "all" ? "All" : mode === "some" ? "Some" : "Only"}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
            {marks.map((mark) => {
              const on = lit.has(mark.key);
              return (
                <button
                  key={mark.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={mark.symbol}
                  title={mark.symbol}
                  onClick={() => onToggleMark(mark.key)}
                  className={`shrink-0 rounded-full transition-transform hover:scale-110 ${on ? "opacity-100" : "opacity-35"}`}
                >
                  <TokenIcon contract={mark.contract} symbol={mark.symbol} size={28} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

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

      <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          key={`${year}-${month}`}
          className="token-cal-month grid h-full grid-cols-7"
          style={{ gridTemplateRows: `repeat(${weekCount}, minmax(8.5rem, 1fr))` }}
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
                className={`flex min-h-[8.5rem] flex-col overflow-visible border-b border-r border-[#27272a] p-2 [&:nth-child(7n)]:border-r-0 ${
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
            className="absolute z-30 overflow-y-auto"
            data-cal-expanded
            style={{
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
              maxHeight: `calc(100% - 16px)`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <TokenEventChip event={expanded} expanded onClose={close} onToggle={close} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
