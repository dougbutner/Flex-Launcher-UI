import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Ellipsis, Handshake, Rocket, Search } from "lucide-react";
import { isSameDay } from "date-fns";
import { TokenIcon } from "@/components/TokenIcon";
import { DecimalText } from "@/components/Amount";
import { ProgramDots } from "@/components/token/ProgramDots";
import { BACKING_LP, DEGEN_LP, ECOSYSTEM_LP } from "@/components/token/StatShapes";
import { WinnerTextLink } from "@/components/winners/WinnerTextLink";
import { BoardFilterRail } from "@/components/winners/BoardFilters";
import { fmtPctChange } from "@/services/alcorMarket";
import { fmtUsd } from "@/services/money";
import {
  applyBoardFilters,
  BOARD_PAGE,
  BOARD_SORT_TABS,
  boardFilterChips,
  clearBoardChip,
  EMPTY_BOARD_FILTERS,
  coverRatio,
  fmtAge,
  fmtCover,
  fmtHolders,
  matchBoardQuery,
  prettyTokenName,
  sortBoardRows,
  type BoardFilters,
  type BoardSortId,
} from "@/services/winnerBoard";
import type { BoardToken } from "@/services/leaderboardStore";
import type { WinnerViewProps } from "@/components/winners/types";
import { MOCK_CLUB_LOCKS, MOCK_SPECS, mockTokenLogo } from "@/test/sandbox/data";

const COVER_BARS = ["#eab308", BACKING_LP, ECOSYSTEM_LP, DEGEN_LP];

function CoverTrack({ ratio }: { ratio: number | null }) {
  const fill = ratio == null ? 0 : Math.min(1, Math.max(0, ratio));
  return (
    <span className="inline-flex min-w-[7.5rem] items-center gap-2" title="Pure liquid backing divided by market cap">
      <span className="relative h-2 w-16 shrink-0 bg-[#262626]">
        <span className="absolute inset-y-0 left-0 flex" style={{ width: `${fill * 100}%` }}>
          {COVER_BARS.map((color) => (
            <span key={color} className="h-full flex-1" style={{ background: color }} />
          ))}
        </span>
      </span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        <DecimalText text={fmtCover(ratio)} />
      </span>
    </span>
  );
}

function Spark({ pts, up }: { pts: number[]; up: boolean }) {
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * 64;
      const y = 23 - ((p - min) / span) * 21;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="64" height="24" className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={up ? "hsl(var(--success))" : "hsl(var(--destructive))"} strokeWidth="1.5" />
    </svg>
  );
}

function RowMenu({ token }: { token: BoardToken }) {
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

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        className="p-1 text-muted-foreground hover:text-foreground"
        aria-label="Token menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] border border-border bg-background py-1 text-xs">
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/token/${token.contract}/${token.symbol}`);
              setOpen(false);
            }}
          >
            View token
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(token.symbol);
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

function hasInsider(symbol: string) {
  if (MOCK_CLUB_LOCKS[symbol]) return true;
  return MOCK_SPECS.some((s) => s.symbol === symbol && s.insiderAt);
}

export default function BoardView({ tokens, extras, extrasBusy }: WinnerViewProps) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<BoardSortId>("volume");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const [draft, setDraft] = useState<BoardFilters>(EMPTY_BOARD_FILTERS);
  const [applied, setApplied] = useState<BoardFilters>(EMPTY_BOARD_FILTERS);
  const [shown, setShown] = useState(BOARD_PAGE);
  const [hi, setHi] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(typed), 150);
    return () => window.clearTimeout(t);
  }, [typed]);

  const rows = useMemo(() => {
    const filtered = applyBoardFilters(tokens.filter((t) => matchBoardQuery(t, query)), applied, extras);
    return sortBoardRows(filtered, sort, dir, extras);
  }, [tokens, query, applied, extras, sort, dir]);

  const page = rows.slice(0, shown);
  const chips = boardFilterChips(applied);

  const setTab = (id: BoardSortId) => {
    if (sort === id) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(id);
      setDir("desc");
    }
  };

  const openRow = (t: BoardToken) => navigate(`/token/${t.contract}/${t.symbol}`);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((i) => Math.min(page.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && page[hi]) openRow(page[hi]);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [page, hi]);

  useEffect(() => {
    setHi(0);
    setShown(BOARD_PAGE);
  }, [query, sort, dir, applied]);

  const rail = (
    <BoardFilterRail
      draft={draft}
      applied={applied}
      setDraft={setDraft}
      apply={(next) => {
        setApplied(next);
        setDraft(next);
      }}
    />
  );

  return (
    <div className="mt-6">
      <div className="flex h-10 flex-wrap items-center gap-x-6 gap-y-2">
        {BOARD_SORT_TABS.map((tab) => (
          <WinnerTextLink key={tab.id} label={tab.label} active={sort === tab.id} bar onClick={() => setTab(tab.id)} />
        ))}
        <label className="relative ml-auto w-64 shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input h-9 py-1 pl-8 text-sm"
            placeholder="Search token by name, symbol or ..."
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </div>

      {chips.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              className="border border-success/40 px-2 py-0.5 font-mono text-[11px] text-success"
              onClick={() => {
                const next = clearBoardChip(applied, c.id);
                setApplied(next);
                setDraft(next);
              }}
            >
              {c.label} ×
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4">{rail}</div>

      <div className="mt-4">
        <div
          ref={bodyRef}
          tabIndex={0}
          className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card outline-none"
        >
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-20 bg-card">
              <tr className="h-11 border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-3 font-medium">#</th>
                <th className="sticky left-0 z-20 w-44 bg-card px-3 font-medium">Token</th>
                <th className="min-w-[88px] px-3 font-medium">
                  <HeaderSort label="Age" active={sort === "age"} dir={dir} onClick={() => setTab("age")} />
                </th>
                <th className="min-w-[110px] px-3 text-right font-medium">
                  <HeaderSort label="Market cap" active={sort === "mcap"} dir={dir} onClick={() => setTab("mcap")} />
                </th>
                <th className="min-w-[148px] px-4 font-medium">
                  <HeaderSort label="Back / cap" active={sort === "cover"} dir={dir} onClick={() => setTab("cover")} />
                </th>
                <th className="min-w-[110px] px-3 text-right font-medium">
                  <HeaderSort label="Vol 24h" active={sort === "volume"} dir={dir} onClick={() => setTab("volume")} />
                </th>
                <th className="min-w-[90px] px-3 text-right font-medium">
                  <HeaderSort label="Holders" active={sort === "holders"} dir={dir} onClick={() => setTab("holders")} />
                </th>
                <th className="min-w-[100px] px-3 text-right font-medium">
                  <HeaderSort label="24h" active={sort === "gainers"} dir={dir} onClick={() => setTab("gainers")} />
                </th>
                <th className="min-w-[72px] px-3 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {page.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No tokens match.
                  </td>
                </tr>
              ) : (
                page.map((t, i) => {
                  const extra = extras?.get(t.id);
                  const chg = extra?.change24;
                  const up = (chg ?? 0) > 0;
                  const down = (chg ?? 0) < 0;
                  const launchToday = t.firstSeenAt > 0 && isSameDay(t.firstSeenAt, Date.now());
                  const bone = extrasBusy && !extra;
                  return (
                    <tr
                      key={t.id}
                      className={`group cursor-pointer border-b border-border/80 hover:bg-white/[0.03] ${
                        hi === i ? "bg-white/[0.04]" : ""
                      }`}
                      onClick={() => openRow(t)}
                      onMouseEnter={() => setHi(i)}
                    >
                      <td className="px-3 py-3 font-mono tabular-nums text-muted-foreground">{i + 1}</td>
                      <td
                        className={`sticky left-0 z-10 w-44 max-w-[11rem] px-3 py-3 ${
                          hi === i ? "bg-muted" : "bg-card"
                        } group-hover:bg-muted`}
                      >
                        <span className="flex items-center gap-2">
                          <TokenIcon
                            contract={t.contract}
                            symbol={t.symbol}
                            src={MOCK_CLUB_LOCKS[t.symbol] ? mockTokenLogo(t.symbol) : undefined}
                            size={20}
                            rounded="md"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1">
                              <span className="truncate font-semibold">${t.symbol}</span>
                              {hasInsider(t.symbol) ? (
                                <Handshake className="h-3 w-3 text-muted-foreground" aria-label="Insider" title="Insider" />
                              ) : null}
                              {launchToday ? (
                                <Rocket className="h-3 w-3 text-muted-foreground" aria-label="Launches today" title="Launches today" />
                              ) : null}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">{prettyTokenName(t.symbol)}</span>
                          </span>
                          <span className="ml-auto flex items-center self-center">
                            <ProgramDots program={t.program} />
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-muted-foreground">{fmtAge(t.firstSeenAt)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        <DecimalText text={fmtUsd(t.mcapUsd)} />
                      </td>
                      <td className="px-4 py-3">
                        <CoverTrack ratio={coverRatio(t.backingUsd, t.mcapUsd)} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        <DecimalText text={fmtUsd(t.volumeUsd)} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtHolders(t.holders)}</td>
                      <td className="px-3 py-3 text-right">
                        {bone ? (
                          <span className="ml-auto block h-3 w-16 animate-pulse bg-secondary" />
                        ) : (
                          <span className="inline-flex items-center justify-end gap-1">
                            {extra?.spark?.length ? <Spark pts={extra.spark} up={up} /> : null}
                            <span
                              className={`font-mono tabular-nums ${
                                up ? "text-success" : down ? "text-destructive" : "text-muted-foreground"
                              }`}
                            >
                              {chg == null ? "-" : <DecimalText text={fmtPctChange(chg)} />}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="h-6 border border-success/60 px-2 text-[11px] uppercase tracking-wide text-success hover:bg-success/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/token/${t.contract}/${t.symbol}`);
                            }}
                          >
                            INSIDE
                          </button>
                          <RowMenu token={t} />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {rows.length > shown ? (
            <button
              type="button"
              className="block w-full py-3 text-center text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
              onClick={() => setShown((n) => n + BOARD_PAGE)}
            >
              Load more
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeaderSort({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button type="button" className={`inline-flex items-center gap-0.5 ${active ? "text-foreground" : ""}`} onClick={onClick}>
      {label}
      <Icon className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
    </button>
  );
}
