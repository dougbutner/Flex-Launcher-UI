import { Link, useParams } from "react-router-dom";
import { CalendarPanel } from "@/components/events/CalendarPanel";
import { ClubFeed } from "@/components/insiders/ClubFeed";
import { TokenIcon } from "@/components/TokenIcon";
import { InsidersSkeleton } from "@/components/ui/PageSkeletons";
import { useEffect, useMemo, useState } from "react";
import { loadLaunchRooms, type LaunchRoom } from "@/services/mechanicsLive";

export default function Insiders() {
  const { contract = "", symbol = "" } = useParams<{ contract?: string; symbol?: string }>();
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  const [rooms, setRooms] = useState<LaunchRoom[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    loadLaunchRooms()
      .then((rows) => {
        if (live) setRooms(rows);
      })
      .catch((e) => {
        if (live) {
          setError(e instanceof Error ? e.message : String(e));
          setRooms([]);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const liveRooms = useMemo(() => (rooms ?? []).filter((r) => r.launched || r.poolId > 0), [rooms]);
  const room = liveRooms.find((r) => r.contract === code && r.symbol === sym) ?? null;
  const pending = (rooms ?? []).find((r) => r.contract === code && r.symbol === sym && !r.launched && r.poolId <= 0) ?? null;

  if (!code || !sym) {
    return <CalendarPanel title="Insiders" />;
  }

  return (
    <div className="insiders mx-auto max-w-[1200px] px-4 pb-8 pt-16 sm:px-6">
      {rooms == null && !error ? (
        <InsidersSkeleton />
      ) : (
        <>
      <ul className="insiders-rail">
        {liveRooms.map((r) => {
          const on = r.contract === code && r.symbol === sym;
          return (
            <li key={`${r.contract}:${r.symbol}`}>
              <Link to={`/insiders/${r.contract}/${r.symbol}`} className={on ? "is-on" : ""}>
                <TokenIcon contract={r.contract} symbol={r.symbol} size={16} />
                <span className="insiders-rail-sym">${r.symbol}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {pending ? <p className="insiders-muted mt-4">${sym} opens after lock and liftoff.</p> : null}
      {code && sym && !room && rooms ? (
        <p className="insiders-muted mt-4">
          No launched or club token at {code}/{sym}. Open the{" "}
          <Link className="link" to={`/token/${code}/${sym}`}>
            token page
          </Link>
          .
        </p>
      ) : null}
      {room ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <ClubFeed contract={room.contract} symbol={room.symbol} poolId={room.poolId} />
          <p className="insiders-muted">
            Full chart and Alcor swap live on{" "}
            <Link className="link" to={`/token/${room.contract}/${room.symbol}`}>
              ${room.symbol}
            </Link>
            .
          </p>
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
