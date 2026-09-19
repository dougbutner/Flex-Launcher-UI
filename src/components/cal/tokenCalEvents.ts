import { flexAccount, type FlexProgram } from "@/config/launch";
import type { CalEvent } from "@/services/launchEvents";
import type { BoardToken } from "@/services/leaderboardStore";
import { MOCK_CLUB_LOCKS, MOCK_SPECS, mockTokenLogo, unixMs, type MockClubLocks, type MockSpec } from "@/test/sandbox/data";

export type ChipColor = "green" | "blue" | "violet" | "orange" | "rose" | "cyan" | "amber" | "yellow";

export type SplitPct = { label: string; pct: number; hint?: string };

export type ClubLockMarks = {
  nft: boolean;
  hold: boolean;
  lp: boolean;
  provenLock: boolean;
  lockDays: number;
};

export type TokenCalEvent = {
  id: string;
  name: string;
  symbol: string;
  contract: string;
  logo?: string;
  marketCap: number;
  startMcap: number;
  endMcap: number;
  liquidity: number;
  launchAt: Date;
  insider: boolean;
  kind: "launch" | "insider";
  platform: string;
  color: ChipColor;
  program: FlexProgram | "core";
  quoteSymbol: string;
  quoteContract: string;
  splits: SplitPct[];
  locks: ClubLockMarks;
};

function locksFromClub(locks?: MockClubLocks): ClubLockMarks {
  return {
    nft: Boolean(locks?.collection && locks?.schema),
    hold: Boolean((locks?.minQty ?? "").trim()),
    lp: (locks?.lpMin ?? 0) > 0,
    provenLock: (locks?.lockedLpMin ?? 0) > 0,
    lockDays: Math.max(0, locks?.lockDays ?? 0),
  };
}

export const CHIP_TONE: Record<ChipColor, string> = {
  green: "border-green-500 bg-green-500/10 text-green-400",
  blue: "border-blue-500 bg-blue-500/10 text-blue-400",
  violet: "border-violet-500 bg-violet-500/10 text-violet-400",
  orange: "border-orange-500 bg-orange-500/10 text-orange-400",
  rose: "border-rose-500 bg-rose-500/10 text-rose-400",
  cyan: "border-cyan-500 bg-cyan-500/10 text-cyan-400",
  amber: "border-amber-500 bg-amber-500/10 text-amber-400",
  yellow: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
};

export const CHIP_BORDER: Record<ChipColor, string> = {
  green: "border-green-500",
  blue: "border-blue-500",
  violet: "border-violet-500",
  orange: "border-orange-500",
  rose: "border-rose-500",
  cyan: "border-cyan-500",
  amber: "border-amber-500",
  yellow: "border-yellow-500",
};

const COLORS: ChipColor[] = ["green", "blue", "violet", "orange", "rose", "cyan", "amber", "yellow"];

function bpsPct(bps: number) {
  return Number.isFinite(bps) ? bps / 100 : 0;
}

function prettyName(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (!s) return "Token";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function splitsFor(program: FlexProgram, spec?: Pick<MockSpec, "reflectionRate" | "burnRate" | "projectRate" | "angelBps" | "jackpotBps" | "quote">): SplitPct[] {
  const reflect = bpsPct(spec?.reflectionRate ?? 0);
  const burn = bpsPct(spec?.burnRate ?? 0);
  const project = bpsPct(spec?.projectRate ?? 0);
  const protocol = spec?.quote?.flex === false ? 0.5 : 0;
  if (program === "easyflex") {
    return [
      { label: "Reflect", pct: reflect },
      { label: "Burn", pct: burn },
    ];
  }
  if (program === "complexflex") {
    return [
      { label: "Reflect", pct: reflect },
      { label: "Burn", pct: burn },
      { label: "Project", pct: project },
    ];
  }
  return [
    { label: "Reflect", pct: reflect },
    { label: "Burn", pct: burn },
    { label: "Project", pct: project },
    { label: "Angel", pct: bpsPct(spec?.angelBps ?? 0), hint: "of rain" },
    { label: "Jackpot", pct: bpsPct(spec?.jackpotBps ?? 0), hint: "of rain" },
    { label: "Protocol", pct: protocol },
  ];
}

function colorFor(symbol: string): ChipColor {
  let n = 0;
  for (let i = 0; i < symbol.length; i++) n = (n + symbol.charCodeAt(i) * (i + 1)) % COLORS.length;
  return COLORS[n];
}

function fromSpec(spec: MockSpec, kind: "launch" | "insider"): TokenCalEvent {
  const at = unixMs(kind === "insider" ? spec.insiderAt : spec.launchAt);
  const startMcap = spec.launched && spec.mcapUsd > 0 ? Math.max(10_000, spec.mcapUsd * 0.12) : 10_000;
  return {
    id: `${kind}:${spec.contract}:${spec.symbol}`,
    name: prettyName(spec.symbol),
    symbol: spec.symbol,
    contract: spec.contract,
    marketCap: spec.mcapUsd,
    startMcap,
    endMcap: spec.mcapUsd > 0 ? spec.mcapUsd : 0,
    liquidity: spec.liqUsd,
    launchAt: new Date(at),
    insider: Boolean(spec.insiderAt),
    kind,
    platform: flexAccount(spec.program),
    color: colorFor(spec.symbol),
    program: spec.program,
    quoteSymbol: spec.quote.symbol,
    quoteContract: spec.quote.contract,
    splits: splitsFor(spec.program, spec),
    logo: mockTokenLogo(spec.symbol),
    locks: locksFromClub(MOCK_CLUB_LOCKS[spec.symbol]),
  };
}

/** Stored mock drops so the month grid is not empty. */
export function sampleTokenEvents(): TokenCalEvent[] {
  const out: TokenCalEvent[] = [];
  for (const spec of MOCK_SPECS) {
    if (spec.insiderAt) out.push(fromSpec(spec, "insider"));
    out.push(fromSpec(spec, "launch"));
  }
  return out;
}

export function fromCalEvents(events: CalEvent[], board: BoardToken[] = []): TokenCalEvent[] {
  const byId = new Map(board.map((t) => [`${t.contract}:${t.symbol}`, t] as const));
  return events
    .filter((ev) => ev.kind === "presale" || ev.kind === "launch")
    .map((ev) => {
      const program = ev.program === "core" ? "easyflex" : ev.program;
      const row = byId.get(`${ev.contract}:${ev.symbol}`);
      const kind = ev.kind === "presale" ? "insider" : "launch";
      return {
        id: ev.id,
        name: prettyName(ev.symbol),
        symbol: ev.symbol,
        contract: ev.contract,
        marketCap: row?.mcapUsd ?? 0,
        startMcap: row?.mcapUsd ? Math.max(10_000, row.mcapUsd * 0.12) : 10_000,
        endMcap: row?.mcapUsd ?? 0,
        liquidity: row?.liqUsd ?? 0,
        launchAt: new Date(ev.at),
        insider: ev.kind === "presale" || events.some((x) => x.kind === "presale" && x.contract === ev.contract && x.symbol === ev.symbol),
        kind,
        platform: ev.program === "core" ? ev.contract : flexAccount(program),
        color: colorFor(ev.symbol),
        program,
        quoteSymbol: ev.quoteSymbol,
        quoteContract: ev.quoteContract,
        splits: splitsFor(program),
        logo: MOCK_CLUB_LOCKS[ev.symbol] ? mockTokenLogo(ev.symbol) : undefined,
        locks: locksFromClub(MOCK_CLUB_LOCKS[ev.symbol]),
      } satisfies TokenCalEvent;
    });
}

export function mergeTokenEvents(live: TokenCalEvent[], sample: TokenCalEvent[]) {
  const have = new Set(live.map((e) => `${e.kind}:${e.contract}:${e.symbol}`));
  return [...live, ...sample.filter((e) => !have.has(`${e.kind}:${e.contract}:${e.symbol}`))];
}
