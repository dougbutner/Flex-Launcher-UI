import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TokenIcon } from "@/components/TokenIcon";
import { fmtUsd } from "@/services/money";
import { fmtPctChange } from "@/services/alcorMarket";
import type { BoardToken } from "@/services/leaderboardStore";
import {
  bubbleValue,
  changePct,
  packBubbles,
  type BubbleSizeId,
  type ChangeWindowId,
  type WinnerExtra,
} from "@/services/winnerViews";
import { MOCK_CLUB_LOCKS, mockTokenLogo } from "@/test/sandbox/data";
import type { WinnerViewProps } from "@/components/winners/types";

const SIZE_LABEL: Record<BubbleSizeId, string> = {
  liq: "Locked liq",
  volume: "Volume",
  mcap: "Cap",
  change: "Change",
  holders: "Holders",
};

function formatSize(token: BoardToken, size: BubbleSizeId, extra: WinnerExtra | undefined, chg: ChangeWindowId) {
  if (size === "holders") return String(token.holders);
  if (size === "change") return fmtPctChange(changePct(extra, chg));
  if (size === "volume") return fmtUsd(token.volumeUsd);
  if (size === "mcap") return fmtUsd(token.mcapUsd);
  return fmtUsd(token.liqUsd);
}

function strokeFor(token: BoardToken, extra: WinnerExtra | undefined, chg: ChangeWindowId, size: BubbleSizeId) {
  if (size === "change") {
    const n = changePct(extra, chg);
    if (n > 0) return "hsl(var(--success))";
    if (n < 0) return "hsl(var(--destructive))";
  }
  if (token.program === "easyflex") return "hsl(142 71% 45%)";
  if (token.program === "complexflex") return "hsl(262 83% 58%)";
  return "hsl(var(--primary))";
}

export function BubblesView({ tokens, size, chg, extras }: WinnerViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 720, h: 560 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const sync = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const packed = useMemo(() => {
    const items = tokens.map((t) => ({
      id: t.id,
      value: bubbleValue(t, size, extras?.get(t.id), chg),
    }));
    return packBubbles(items, box.w, box.h);
  }, [tokens, size, chg, extras, box]);

  const byId = useMemo(() => new Map(tokens.map((t) => [t.id, t] as const)), [tokens]);

  return (
    <div
      ref={wrap}
      className="relative mt-8 h-[min(72vh,640px)] overflow-hidden border border-border bg-card"
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        {packed.map((b) => {
          const t = byId.get(b.id);
          if (!t) return null;
          return (
            <circle
              key={`ring:${b.id}`}
              cx={b.x}
              cy={b.y}
              r={b.r}
              fill="hsl(var(--card))"
              stroke={strokeFor(t, extras?.get(t.id), chg, size)}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      {packed.map((b) => {
        const t = byId.get(b.id);
        if (!t) return null;
        const extra = extras?.get(t.id);
        const d = b.r * 2;
        const showLabel = b.r >= 28;
        return (
          <Link
            key={b.id}
            to={`/token/${t.contract}/${t.symbol}`}
            title={`${t.symbol} ${SIZE_LABEL[size]} ${formatSize(t, size, extra, chg)}`}
            className="absolute flex flex-col items-center justify-center text-center"
            style={{ left: b.x - b.r, top: b.y - b.r, width: d, height: d }}
          >
            <TokenIcon
              contract={t.contract}
              symbol={t.symbol}
              src={MOCK_CLUB_LOCKS[t.symbol] ? mockTokenLogo(t.symbol) : undefined}
              size={Math.max(18, Math.min(44, b.r * 0.7))}
              rounded="xl"
            />
            {showLabel ? (
              <>
                <span className="mt-0.5 max-w-full truncate font-mono text-[10px] font-bold leading-none">{t.symbol}</span>
                <span className="max-w-full truncate font-mono text-[9px] text-muted-foreground">
                  {formatSize(t, size, extra, chg)}
                </span>
              </>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
