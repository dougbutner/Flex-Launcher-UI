import { CACHE_KEYS } from "@/services/cacheKeys";
import { readPresale } from "@/services/flexTables";
import { loadBoardTokens, loadFreshBoard, type BoardToken } from "@/services/leaderboardStore";
import { loadLaunchRooms, loadLaunchRoomsFresh, type LaunchRoom } from "@/services/mechanicsLive";
import { liveOr } from "@/services/readThrough";

export type CalKind = "presale" | "launch" | "liftoff" | "unlock";

export type CalEvent = {
  id: string;
  kind: CalKind;
  at: number;
  contract: string;
  symbol: string;
  program: BoardToken["program"] | LaunchRoom["program"];
  quoteSymbol: string;
  quoteContract: string;
  poolId: number;
};

export function unixToMs(n: number): number {
  if (!(n > 0)) return 0;
  if (n > 1e12) return n;
  if (n > 1e9) return n * 1000;
  return 0;
}

export function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function eventKindLabel(kind: CalKind) {
  if (kind === "presale") return "Insiders";
  if (kind === "launch") return "Launch";
  if (kind === "liftoff") return "Liftoff";
  return "LP unlock";
}

export function eventsByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const ev of events) {
    if (!(ev.at > 1e11)) continue;
    const key = dayKey(ev.at);
    const list = map.get(key) ?? [];
    list.push(ev);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.at - b.at);
  return map;
}

export function monthEvents(events: CalEvent[], year: number, month: number): CalEvent[] {
  return events
    .filter((ev) => {
      if (!(ev.at > 1e11)) return false;
      const d = new Date(ev.at);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => a.at - b.at);
}

export function clubDateEvents(events: CalEvent[]): CalEvent[] {
  return events.filter((ev) => ev.kind === "presale" || ev.kind === "launch").sort((a, b) => a.at - b.at);
}

function pushEvent(events: CalEvent[], row: CalEvent) {
  if (!(row.at > 1e11)) return;
  events.push(row);
}

async function assembleCalendar(board: BoardToken[], rooms: LaunchRoom[]): Promise<{ events: CalEvent[]; rooms: LaunchRoom[] }> {
  const seen = new Map(board.map((t) => [t.id, t] as const));
  const events: CalEvent[] = [];
  const clubRooms = rooms.filter((r) => r.program !== "core");
  const presales = await Promise.all(
    clubRooms.map(async (room) => {
      const row = await readPresale(room.contract, room.symbol).catch(() => null);
      return [room, row] as const;
    })
  );

  for (const [room, presale] of presales) {
    const boardRow = seen.get(`${room.contract}:${room.symbol}`);
    const quoteSymbol = room.quoteSymbol || boardRow?.quoteSymbol || "";
    const quoteContract = room.quoteContract || "";
    const base = {
      contract: room.contract,
      symbol: room.symbol,
      program: room.program,
      quoteSymbol,
      quoteContract,
      poolId: room.poolId,
    };
    const insiderMs = unixToMs(Number(presale?.insider_time ?? 0));
    const launchMs = unixToMs(Number(presale?.launch_time ?? 0));
    if (insiderMs) {
      pushEvent(events, {
        ...base,
        id: `presale:${room.contract}:${room.symbol}`,
        kind: "presale",
        at: insiderMs,
      });
    }
    if (launchMs) {
      pushEvent(events, {
        ...base,
        id: `launch:${room.contract}:${room.symbol}`,
        kind: "launch",
        at: launchMs,
      });
    } else if (room.launched) {
      const at = boardRow && boardRow.firstSeenAt > 1e11 ? boardRow.firstSeenAt : 0;
      if (at) {
        pushEvent(events, {
          ...base,
          id: `liftoff:${room.contract}:${room.symbol}`,
          kind: "liftoff",
          at,
        });
      }
    }
    const unlockMs = unixToMs(room.unlockTime);
    if (unlockMs) {
      pushEvent(events, {
        ...base,
        id: `unlock:${room.contract}:${room.symbol}`,
        kind: "unlock",
        at: unlockMs,
      });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return { events, rooms };
}

/** Chain read used by the MySQL snapshot. Skips the browser caches. */
export async function loadCalendarEventsFresh(): Promise<{ events: CalEvent[]; rooms: LaunchRoom[] }> {
  const [board, rooms] = await Promise.all([
    loadFreshBoard().catch(() => [] as BoardToken[]),
    loadLaunchRoomsFresh(),
  ]);
  return assembleCalendar(board, rooms);
}

export async function loadCalendarEvents(opts?: { force?: boolean }): Promise<{ events: CalEvent[]; rooms: LaunchRoom[] }> {
  return liveOr(
    CACHE_KEYS.calendar,
    async () => {
      if (typeof window === "undefined") return loadCalendarEventsFresh();
      const [board, rooms] = await Promise.all([
        loadBoardTokens().catch(() => [] as BoardToken[]),
        loadLaunchRooms(),
      ]);
      return assembleCalendar(board, rooms);
    },
    opts
  );
}
