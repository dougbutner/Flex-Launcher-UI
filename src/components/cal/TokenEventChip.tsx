import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, Ellipsis, Handshake, Images, Layers, Lock, LockKeyhole, Rocket } from "lucide-react";
import { format } from "date-fns";
import { TokenIcon } from "@/components/TokenIcon";
import { DecimalText } from "@/components/Amount";
import { fmtUsd } from "@/services/money";
import { CHIP_BORDER, CHIP_TONE, type TokenCalEvent } from "@/components/cal/tokenCalEvents";

function pctLabel(n: number) {
  return `${n.toFixed(2)}%`;
}

function lockMarks(event: TokenCalEvent) {
  const l = event.locks ?? { nft: false, hold: false, lp: false, provenLock: false, lockDays: 0 };
  const marks: { Icon: typeof Lock; label: string }[] = [];
  if (l.nft) marks.push({ Icon: Images, label: "NFT gate" });
  if (l.hold) marks.push({ Icon: Coins, label: "Min hold" });
  if (l.lp) marks.push({ Icon: Layers, label: "LP min" });
  if (l.provenLock) marks.push({ Icon: LockKeyhole, label: "Proven LP lock" });
  if (l.lockDays > 0) marks.push({ Icon: Lock, label: `${l.lockDays}d lock` });
  if (!marks.length && (event.insider || event.kind === "insider")) {
    marks.push({ Icon: Handshake, label: "Insider club" });
  }
  return marks;
}

function InsiderLockIcons({ event, size = 12 }: { event: TokenCalEvent; size?: number }) {
  const marks = lockMarks(event);
  if (!marks.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {marks.map(({ Icon, label }) => (
        <span key={label} title={label} className="inline-flex">
          <Icon style={{ width: size, height: size }} aria-hidden />
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </span>
  );
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
      <article
        className={`relative flex w-full flex-col rounded-xl border bg-card p-3 text-card-foreground shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] ${CHIP_BORDER[event.color]}`}
      >
        <div className="flex items-start gap-2">
          <TokenIcon contract={event.contract} symbol={event.symbol} src={event.logo} size={40} rounded="xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{event.name}</p>
            <p className="font-mono text-base font-black tracking-tight">${event.symbol}</p>
            {event.kind === "insider" ? (
              <p className="text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-muted-foreground">PRE</p>
            ) : null}
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{event.platform}</p>
          </div>
          <DotsMenu event={event} onDone={onClose} />
        </div>

        <div className="mt-2 space-y-1 text-[11px] leading-snug">
          <p className="flex items-center gap-1.5">
            <Rocket className="h-3 w-3 shrink-0" />
            <span>{format(event.launchAt, "MMM d, yyyy h:mm a")}</span>
          </p>
          {lockMarks(event).length ? (
            <p className="flex flex-wrap items-center gap-2">
              {lockMarks(event).map(({ Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1" title={label}>
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  <span>{label}</span>
                </span>
              ))}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
            <p>
              Cap <span className="font-semibold"><DecimalText text={cap} /></span>
            </p>
            <p>
              Liq <span className="font-semibold"><DecimalText text={fmtUsd(event.liquidity)} /></span>
            </p>
            <p>
              Start <span className="font-semibold"><DecimalText text={fmtUsd(event.startMcap)} /></span>
            </p>
            <p>
              End <span className="font-semibold"><DecimalText text={fmtUsd(event.endMcap)} /></span>
            </p>
          </div>
        </div>

        {event.splits.length ? (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {event.splits.map((s) => (
              <div key={s.label} className="border border-border bg-secondary px-1.5 py-1">
                <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                  {s.hint ? ` ${s.hint}` : ""}
                </p>
                <p className="font-mono text-xs font-bold">
                  <DecimalText text={pctLabel(s.pct)} />
                </p>
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
      className={`group/chip relative z-10 flex min-h-8 w-full origin-top-left cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1.5 text-left transition-transform duration-150 hover:z-20 hover:scale-[1.06] hover:shadow-lg ${tone}`}
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
      <TokenIcon contract={event.contract} symbol={event.symbol} src={event.logo} size={16} rounded="xl" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-[10px] font-bold leading-none sm:text-xs">{event.symbol}</span>
        {event.kind === "insider" ? (
          <span className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.16em] opacity-80">PRE</span>
        ) : null}
      </span>
      <span className="hidden truncate text-[9px] opacity-80 sm:inline">
        <DecimalText text={cap} />
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <InsiderLockIcons event={event} size={12} />
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
