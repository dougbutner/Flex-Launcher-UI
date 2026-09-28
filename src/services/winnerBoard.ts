import { FLEX_PROGRAMS, flexAccount, type FlexProgram } from "@/config/launch";
import type { BoardToken } from "@/services/leaderboardStore";
import { fmtUsd } from "@/services/money";
import type { WinnerExtra } from "@/services/winnerViews";

export const BOARD_SORT_IDS = ["volume", "mcap", "holders", "age", "gainers", "cover"] as const;
export type BoardSortId = (typeof BOARD_SORT_IDS)[number];

export const BOARD_SORT_TABS: Array<{ id: BoardSortId; label: string }> = [
  { id: "volume", label: "Volume" },
  { id: "mcap", label: "Market cap" },
  { id: "holders", label: "Holders" },
  { id: "age", label: "Age" },
  { id: "gainers", label: "Gainers" },
];

export type AgeUnit = "h" | "d";

export type BoardFilters = {
  programs: FlexProgram[];
  mcapMin: string;
  mcapMax: string;
  volMin: string;
  volMax: string;
  holdersMin: string;
  holdersMax: string;
  ageMin: string;
  ageMax: string;
  ageUnit: AgeUnit;
  change7Min: string;
  change7Max: string;
  showChange7: boolean;
};

export const EMPTY_BOARD_FILTERS: BoardFilters = {
  programs: [],
  mcapMin: "",
  mcapMax: "",
  volMin: "",
  volMax: "",
  holdersMin: "",
  holdersMax: "",
  ageMin: "",
  ageMax: "",
  ageUnit: "d",
  change7Min: "",
  change7Max: "",
  showChange7: false,
};

export const BOARD_PAGE = 100;

export function prettyTokenName(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (!s) return "Token";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function fmtAge(atMs: number, now = Date.now()): string {
  if (!(atMs > 0)) return "-";
  const d = Math.max(0, now - atMs);
  const mins = Math.floor(d / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d`;
  return `${Math.max(1, Math.floor(days / 30))}mo`;
}

/** Pure liquid backing divided by market cap. Null when either side is missing. */
export function coverRatio(backingUsd: number, mcapUsd: number): number | null {
  if (!(backingUsd > 0) || !(mcapUsd > 0)) return null;
  const q = backingUsd / mcapUsd;
  return Number.isFinite(q) ? q : null;
}

export function fmtCover(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "-";
  const pct = ratio * 100;
  const abs = Math.abs(pct);
  if (abs >= 1000) return `${pct.toFixed(0)}%`;
  if (abs >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

export function fmtHolders(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

export function ageMs(token: BoardToken, now = Date.now()) {
  return token.firstSeenAt > 0 ? Math.max(0, now - token.firstSeenAt) : 0;
}

function num(raw: string): number | undefined {
  const t = raw.trim().replace(/[$,]/g, "");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function inRange(value: number, minRaw: string, maxRaw: string) {
  const min = num(minRaw);
  const max = num(maxRaw);
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

export function matchBoardQuery(token: BoardToken, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const name = prettyTokenName(token.symbol).toLowerCase();
  return (
    token.symbol.toLowerCase().includes(needle) ||
    name.includes(needle) ||
    token.contract.toLowerCase().includes(needle) ||
    token.quoteSymbol.toLowerCase().includes(needle)
  );
}

export function applyBoardFilters(
  tokens: BoardToken[],
  filters: BoardFilters,
  extras: Map<string, WinnerExtra> | null,
  now = Date.now()
): BoardToken[] {
  const unitMs = filters.ageUnit === "h" ? 3_600_000 : 86_400_000;
  return tokens.filter((t) => {
    if (filters.programs.length && !filters.programs.includes(t.program)) return false;
    if (!inRange(t.mcapUsd, filters.mcapMin, filters.mcapMax)) return false;
    if (!inRange(t.volumeUsd, filters.volMin, filters.volMax)) return false;
    if (!inRange(t.holders, filters.holdersMin, filters.holdersMax)) return false;
    const age = ageMs(t, now) / unitMs;
    if (!inRange(age, filters.ageMin, filters.ageMax)) return false;
    if (filters.showChange7) {
      const chg = extras?.get(t.id)?.changeWeek ?? 0;
      if (!inRange(chg, filters.change7Min, filters.change7Max)) return false;
    }
    return true;
  });
}

export function sortBoardRows(
  tokens: BoardToken[],
  key: BoardSortId,
  dir: "asc" | "desc",
  extras: Map<string, WinnerExtra> | null
): BoardToken[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...tokens].sort((a, b) => {
    let av = 0;
    let bv = 0;
    if (key === "volume") {
      av = a.volumeUsd;
      bv = b.volumeUsd;
    } else if (key === "mcap") {
      av = a.mcapUsd;
      bv = b.mcapUsd;
    } else if (key === "holders") {
      av = a.holders;
      bv = b.holders;
    } else if (key === "age") {
      av = a.firstSeenAt;
      bv = b.firstSeenAt;
    } else if (key === "cover") {
      av = coverRatio(a.backingUsd, a.mcapUsd) ?? 0;
      bv = coverRatio(b.backingUsd, b.mcapUsd) ?? 0;
    } else {
      av = extras?.get(a.id)?.change24 ?? 0;
      bv = extras?.get(b.id)?.change24 ?? 0;
    }
    if (av !== bv) return (av - bv) * sign;
    return a.symbol.localeCompare(b.symbol);
  });
}

export type BoardChip = { id: string; label: string };

export function boardFilterChips(filters: BoardFilters): BoardChip[] {
  const chips: BoardChip[] = [];
  for (const p of filters.programs) {
    chips.push({ id: `program:${p}`, label: flexAccount(p) });
  }
  const prettyBound = (raw: string, money: boolean) => {
    const n = Number(raw.replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return raw;
    return money ? fmtUsd(n) : fmtHolders(n);
  };
  const rangeChip = (id: string, label: string, min: string, max: string, money = false) => {
    const a = min.trim();
    const b = max.trim();
    if (!a && !b) return;
    if (a && b) chips.push({ id, label: `${label} ${prettyBound(a, money)}-${prettyBound(b, money)}` });
    else if (a) chips.push({ id, label: `${label} > ${prettyBound(a, money)}` });
    else chips.push({ id, label: `${label} < ${prettyBound(b, money)}` });
  };
  rangeChip("mcap", "Cap", filters.mcapMin, filters.mcapMax, true);
  rangeChip("vol", "Vol", filters.volMin, filters.volMax, true);
  rangeChip("holders", "Holders", filters.holdersMin, filters.holdersMax);
  if (filters.ageMin.trim() || filters.ageMax.trim()) {
    rangeChip("age", `Age ${filters.ageUnit}`, filters.ageMin, filters.ageMax);
  }
  if (filters.showChange7) rangeChip("change7", "7d", filters.change7Min, filters.change7Max);
  return chips;
}

export function clearBoardChip(filters: BoardFilters, id: string): BoardFilters {
  if (id.startsWith("program:")) {
    const p = id.slice("program:".length) as FlexProgram;
    return { ...filters, programs: filters.programs.filter((x) => x !== p) };
  }
  if (id === "mcap") return { ...filters, mcapMin: "", mcapMax: "" };
  if (id === "vol") return { ...filters, volMin: "", volMax: "" };
  if (id === "holders") return { ...filters, holdersMin: "", holdersMax: "" };
  if (id === "age") return { ...filters, ageMin: "", ageMax: "" };
  if (id === "change7") return { ...filters, change7Min: "", change7Max: "", showChange7: false };
  return filters;
}

export function programChoices() {
  return FLEX_PROGRAMS.map((p) => ({ id: p.id, label: flexAccount(p.id) }));
}

