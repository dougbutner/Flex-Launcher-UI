import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ellipsis, Handshake, Rocket } from "lucide-react";
import { format } from "date-fns";
import { TokenIcon } from "@/components/TokenIcon";
import { fmtUsd } from "@/services/money";
import { CHIP_TONE, type TokenCalEvent } from "@/components/cal/tokenCalEvents";

function pctLabel(n: number) {
  return `${n.toFixed(2)}%`;
}

function DotsMenu({ event, onDone }: { event: TokenCalEvent; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const goToken = () => {
    navigate(`/token/${event.contract}/${event.symbol}`);
    setOpen(false);
    onDone?.();
  };

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        className="rounded p-0.5 text-current hover:bg-white/10"
        aria-label="Token menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] border border-border bg-background py-1 text-xs text-foreground shadow-lg">
          <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-muted" onClick={goToken}>
            View token
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(event.symbol);
              setOpen(false);
            }}
          >
            Copy symbol
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/insiders/${event.contract}/${event.symbol}`);
              setOpen(false);
              onDone?.();
            }}
          >
            Open launch page
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TokenEventChip({
  event,
  expanded = false,
  onToggle,
  onClose,
}: {
  event: TokenCalEvent;
  expanded?: boolean;
  onToggle?: (el?: HTMLElement) => void;
  onClose?: () => void;
}) {
  const tone = CHIP_TONE[event.color];
  const cap = fmtUsd(event.marketCap);

  if (expanded) {
    return (
      <article className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border p-3 shadow-xl ${tone} bg-background/95 text-foreground`}>
        <div className="flex items-start gap-3">
          <TokenIcon contract={event.contract} symbol={event.symbol} size={48} rounded="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{event.name}</p>
            <p className="font-mono text-lg font-black tracking-tight">${event.symbol}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{event.platform}</p>
          </div>
          <DotsMenu event={event} onDone={onClose} />
        </div>

        <div className="mt-3 space-y-1.5 text-xs">
          <p className="flex items-center gap-2">
            <Rocket className="h-3.5 w-3.5 shrink-0" />
            <span>{format(event.launchAt, "MMM d, yyyy h:mm a")}</span>
          </p>
          {event.insider ? (
            <p className="flex items-center gap-2">
              <Handshake className="h-3.5 w-3.5 shrink-0" />
              <span>Insider</span>
            </p>
          ) : null}
          <p>
            Market cap <span className="font-mono font-semibold">{cap}</span>
          </p>
          <p>
            Start <span className="font-mono font-semibold">{fmtUsd(event.startMcap)}</span>
          </p>
          <p>
            End <span className="font-mono font-semibold">{fmtUsd(event.endMcap)}</span>
          </p>
          <p>
            Backing liquidity <span className="font-mono font-semibold">{fmtUsd(event.liquidity)}</span>
          </p>
        </div>

        {event.splits.length ? (
          <div className={`mt-3 grid min-h-0 flex-1 gap-1.5 ${event.splits.length > 3 ? "grid-cols-2" : "grid-cols-1"}`}>
            {event.splits.map((s) => (
              <div key={s.label} className="border border-border/80 bg-background/40 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                  {s.hint ? ` ${s.hint}` : ""}
                </p>
                <p className="font-mono text-sm font-bold">{pctLabel(s.pct)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group/chip relative z-10 flex w-full origin-top-left cursor-pointer items-center gap-1 rounded-md border px-1 py-0.5 text-left transition-transform duration-150 hover:z-20 hover:scale-[1.06] hover:shadow-lg ${tone}`}
      data-cal-chip={event.id}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onToggle?.(e.currentTarget);
      }}
    >
      <TokenIcon contract={event.contract} symbol={event.symbol} size={16} rounded="xl" />
      <span className="truncate font-mono text-[10px] font-bold leading-none sm:text-xs">{event.symbol}</span>
      <span className="hidden truncate text-[9px] opacity-80 sm:inline">{cap}</span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        {event.kind === "insider" || event.insider ? <Handshake className="h-3 w-3" /> : null}
        {event.kind === "launch" ? <Rocket className="h-3 w-3" /> : null}
        <span
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <DotsMenu event={event} />
        </span>
      </span>
    </div>
  );
}
