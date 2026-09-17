import { useState } from "react";
import { validGiphyUrl } from "@/services/insidersRules";

type Hit = { id: string; url: string; preview: string };

const KEY = import.meta.env.VITE_GIPHY_API_KEY?.trim() || "";

export function GifPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (url: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const search = () => {
    const query = q.trim();
    if (!query || !KEY) return;
    setBusy(true);
    setErr("");
    void fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(KEY)}&q=${encodeURIComponent(query)}&limit=8&rating=pg-13`
    )
      .then(async (res) => {
        const body = (await res.json()) as {
          data?: Array<{ id: string; images?: { downsized?: { url?: string }; fixed_height_small?: { url?: string } } }>;
        };
        const next = (body.data ?? [])
          .map((g) => ({
            id: g.id,
            url: g.images?.downsized?.url || "",
            preview: g.images?.fixed_height_small?.url || g.images?.downsized?.url || "",
          }))
          .filter((g) => g.url && validGiphyUrl(g.url));
        setHits(next);
        if (!next.length) setErr("No GIFs.");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  if (value) {
    return (
      <div className="insiders-gif-picked">
        <img src={value} alt="" />
        <button type="button" className="link text-xs" onClick={() => onPick("")}>
          Remove GIF
        </button>
      </div>
    );
  }

  return (
    <div className="insiders-gif">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={KEY ? "Search Giphy" : "Paste a Giphy URL"}
          className="min-w-0 flex-1 border border-border bg-transparent px-2 py-1 text-xs"
          aria-label="GIF search"
        />
        {KEY ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={search} disabled={busy || !q.trim()}>
            {busy ? "…" : "GIF"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const url = q.trim();
              if (validGiphyUrl(url)) onPick(url);
              else setErr("Need a https Giphy URL.");
            }}
          >
            Attach
          </button>
        )}
      </div>
      {err ? <p className="mt-1 text-[11px] text-destructive">{err}</p> : null}
      {hits.length ? (
        <div className="insiders-gif-grid">
          {hits.map((g) => (
            <button key={g.id} type="button" onClick={() => onPick(g.url)} aria-label="Pick GIF">
              <img src={g.preview} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
