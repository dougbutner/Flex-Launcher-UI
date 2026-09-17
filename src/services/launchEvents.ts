import { loadBoardTokens, type BoardToken } from "@/services/leaderboardStore";
import { loadLaunchRooms, type LaunchRoom } from "@/services/mechanicsLive";

export type CalEvent = {
  id: string;
  kind: "liftoff" | "unlock";
  at: number;
  contract: string;
  symbol: string;
  program: BoardToken["program"] | LaunchRoom["program"];
  quoteSymbol: string;
  poolId: number;
};

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

export async function loadCalendarEvents(): Promise<{ events: CalEvent[]; rooms: LaunchRoom[] }> {
  const [board, rooms] = await Promise.all([loadBoardTokens().catch(() => [] as BoardToken[]), loadLaunchRooms()]);
  const seen = new Map(board.map((t) => [t.id, t] as const));
  const events: CalEvent[] = [];
  for (const room of rooms) {
    const boardRow = seen.get(`${room.contract}:${room.symbol}`);
    if (room.launched) {
      const at = boardRow && boardRow.firstSeenAt > 1e11 ? boardRow.firstSeenAt : 0;
      if (at) {
        events.push({
          id: `liftoff:${room.contract}:${room.symbol}`,
          kind: "liftoff",
          at,
          contract: room.contract,
          symbol: room.symbol,
          program: room.program,
          quoteSymbol: room.quoteSymbol || boardRow?.quoteSymbol || "",
          poolId: room.poolId,
        });
      }
    }
    const unlockMs = room.unlockTime > 1e12 ? room.unlockTime : room.unlockTime > 0 ? room.unlockTime * 1000 : 0;
    if (unlockMs > 1e11) {
      events.push({
        id: `unlock:${room.contract}:${room.symbol}`,
        kind: "unlock",
        at: unlockMs,
        contract: room.contract,
        symbol: room.symbol,
        program: room.program,
        quoteSymbol: room.quoteSymbol || boardRow?.quoteSymbol || "",
        poolId: room.poolId,
      });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return { events, rooms };
}
