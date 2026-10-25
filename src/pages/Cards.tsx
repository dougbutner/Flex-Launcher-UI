import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { TxLink } from "@/components/launch/ui";
import { drawHoloCard, type CardArt } from "@/components/cards/drawHoloCard";
import {
  CARD_DEFAULTS,
  CARD_H,
  CARD_LAYERS_ON,
  CARD_PATTERNS,
  CARD_RANKS,
  CARD_TOKENS,
  CARD_W,
  FOILS,
  HOLO_COLLECTION,
  cardCopy,
  foilOf,
  logoSrcs,
  mintPlan,
  patternSrcs,
  printSrc,
  usesPrintedFace,
  type CardLayers,
  type CardSettings,
  type FoilId,
  type PatternId,
} from "@/config/holoCards";
import { HOLO_ISSUER } from "@/config/holoLaunch";
import { useWallet } from "@/hooks/useWallet";
import { validAccount } from "@/services/assets";
import { pinLogoFile } from "@/services/ipfsPin";
import { getTableRows } from "@/services/rpc";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

const SAVE_KEY = "holo-cards-v1";

const LAYER_LABELS: { id: keyof CardLayers; label: string }[] = [
  { id: "foil", label: "Foil" },
  { id: "repeat", label: "Repeat" },
  { id: "mark", label: "Mark" },
  { id: "corners", label: "Corners" },
  { id: "edges", label: "Edges" },
  { id: "edition", label: "Edition" },
];

function loadFirst(urls: string[]): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const tryAt = (i: number) => {
      if (i >= urls.length) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => tryAt(i + 1);
      img.src = urls[i];
    };
    tryAt(0);
  });
}

function clamp(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function loadSettings(): CardSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "") as Partial<CardSettings>;
    const symbol = CARD_TOKENS.includes(raw.symbol as CardSettings["symbol"]) ? raw.symbol! : CARD_DEFAULTS.symbol;
    const foil = FOILS.some((f) => f.id === raw.foil) ? (raw.foil as FoilId) : CARD_DEFAULTS.foil;
    const rank = CARD_RANKS.includes(raw.rank as (typeof CARD_RANKS)[number]) ? raw.rank! : CARD_DEFAULTS.rank;
    const pattern = CARD_PATTERNS.some((p) => p.id === raw.pattern) ? (raw.pattern as PatternId) : CARD_DEFAULTS.pattern;
    const layers = { ...CARD_LAYERS_ON, ...(raw.layers ?? {}) };
    return {
      symbol,
      foil,
      rank,
      pattern,
      logoWidth: clamp(Number(raw.logoWidth), 0.4, 0.8, CARD_DEFAULTS.logoWidth),
      rankScale: clamp(Number(raw.rankScale), 1, 2.8, CARD_DEFAULTS.rankScale),
      bleed: Math.round(clamp(Number(raw.bleed), 16, 80, CARD_DEFAULTS.bleed)),
      overlap: clamp(Number(raw.overlap), 0, 0.4, CARD_DEFAULTS.overlap),
      layers,
    };
  } catch {
    return { ...CARD_DEFAULTS, layers: { ...CARD_LAYERS_ON } };
  }
}

function Chip(props: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`border px-2.5 py-1 text-xs font-semibold ${
        props.on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {props.label}
    </button>
  );
}

export default function Cards() {
  const { actor, transact } = useWallet();
  const [spec, setSpec] = useState<CardSettings>(loadSettings);
  const [art, setArt] = useState<CardArt>({ logo: null, pattern: null });
  const [printOk, setPrintOk] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 6, y: -10 });
  const [owner, setOwner] = useState(HOLO_ISSUER);
  const [minting, setMinting] = useState(false);
  const [mintErr, setMintErr] = useState("");
  const [mintTx, setMintTx] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const issuer = actor?.toLowerCase() === HOLO_ISSUER;
  const printed = usesPrintedFace(spec) && printOk;
  const face = printSrc(spec);
  const copy = useMemo(() => cardCopy(spec), [spec]);

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(spec));
  }, [spec]);

  useEffect(() => {
    let live = true;
    setPrintOk(true);
    void Promise.all([loadFirst(logoSrcs(spec.symbol)), loadFirst(patternSrcs(spec.symbol, spec.pattern))]).then(
      ([logo, pattern]) => {
        if (live) setArt({ logo, pattern });
      },
    );
    return () => {
      live = false;
    };
  }, [spec.symbol, spec.pattern]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawHoloCard(ctx, spec, art);
  }, [spec, art]);

  const patch = (next: Partial<CardSettings>) => setSpec((cur) => ({ ...cur, ...next }));

  const onStageMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    setTilt({ x: (0.5 - py) * 14 + 4, y: (px - 0.5) * 18 - 6 });
  };

  const mint = async () => {
    if (!issuer || !actor) return;
    const to = owner.trim().toLowerCase();
    if (!validAccount(to)) {
      setMintErr("Enter the account that should receive the card.");
      return;
    }
    setMinting(true);
    setMintErr("");
    setMintTx("");
    try {
      const file = await cardFile(printed, face, canvasRef.current, spec);
      const pin = await pinLogoFile(file);
      const [col, schemas] = await Promise.all([
        getTableRows({ code: "atomicassets", scope: HOLO_COLLECTION, table: "collections", limit: 1 }),
        getTableRows<{ schema_name?: string }>({ code: "atomicassets", scope: HOLO_COLLECTION, table: "schemas", limit: 40 }),
      ]);
      const actions = mintPlan({
        issuer: actor,
        owner: to,
        cid: pin.cid,
        pageUrl: `${window.location.origin}/cards`,
        spec,
        needCollection: col.rows.length === 0,
        needSchema: !schemas.rows.some((row) => row.schema_name === "image"),
      });
      const result = await transact(actions);
      setMintTx(txIdFromResult(result) || "ok");
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setMintErr(hint ? `${msg} - ${hint}` : msg);
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Holo cards</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Pick a token, a foil, and a rank. Turn the card, or change the face and watch it update.
      </p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div
            ref={stageRef}
            className="relative flex min-h-[32rem] items-center justify-center overflow-hidden rounded-lg border border-border bg-[radial-gradient(ellipse_at_center,rgba(234,179,8,0.16),transparent_58%),#070605] sm:min-h-[36rem]"
            onPointerMove={onStageMove}
            onPointerLeave={() => setTilt({ x: 6, y: -10 })}
          >
            <div className="pointer-events-none absolute inset-0" style={{ perspective: "1200px" }} aria-hidden>
              {FOILS.filter((f) => f.id !== spec.foil).map((f, i) => (
                <img
                  key={f.id}
                  src={printSrc({ ...spec, foil: f.id })}
                  alt=""
                  className="absolute top-1/2 w-[168px] rounded-xl opacity-80 shadow-2xl"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  style={{
                    left: "50%",
                    transform: `translate(-50%, -50%) translateX(${(i - 1) * 168}px) rotateY(${(i - 1) * 22}deg) rotateZ(${(i - 1) * 6}deg)`,
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="relative aspect-[5/7] w-[min(300px,74vw)] border-0 bg-transparent p-0"
              style={{ perspective: "1400px" }}
              onClick={() => setFlipped((v) => !v)}
              aria-label={flipped ? "Show the face" : "Show the back"}
            >
              <span
                className="relative block h-full w-full transition-transform duration-200"
                style={{
                  transformStyle: "preserve-3d",
                  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + (flipped ? 180 : 0)}deg)`,
                }}
              >
                <span
                  className="absolute inset-0 overflow-hidden rounded-[18px] shadow-[0_30px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/20"
                  style={{ backfaceVisibility: "hidden" }}
                >
                  {printed ? (
                    <img src={face} alt={`${copy.name}, ${copy.title}`} className="h-full w-full object-cover" onError={() => setPrintOk(false)} />
                  ) : null}
                  <canvas ref={canvasRef} width={CARD_W} height={CARD_H} className={`h-full w-full ${printed ? "hidden" : ""}`} />
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `linear-gradient(${110 + tilt.y}deg, transparent 36%, rgba(255,255,255,0.38) 48%, transparent 60%)`,
                    }}
                  />
                </span>
                <span
                  className="absolute inset-0 overflow-hidden rounded-[18px] bg-[#120e09] shadow-[0_30px_60px_rgba(0,0,0,0.55)] ring-1 ring-primary/40"
                  style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                  <span className="absolute inset-3 rounded-[12px] border border-primary/50" />
                  <span className="absolute inset-6 rounded-[10px] border border-primary/25" />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <span className="block text-4xl text-primary">♦</span>
                    <span className="mt-2 block text-xs font-bold uppercase tracking-[0.28em] text-primary">Holo</span>
                  </span>
                </span>
              </span>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {CARD_RANKS.map((rank) => (
              <button
                key={rank}
                type="button"
                className={`h-9 min-w-[2.25rem] border px-2 font-mono text-sm ${
                  spec.rank === rank ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => patch({ rank })}
              >
                {rank}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Click the card to turn it over.</p>
        </div>

        <div className="space-y-5">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Token</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CARD_TOKENS.map((symbol) => (
                <Chip key={symbol} label={symbol} on={spec.symbol === symbol} onClick={() => patch({ symbol })} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Foil</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FOILS.map((foil) => (
                <Chip key={foil.id} label={foil.label} on={spec.foil === foil.id} onClick={() => patch({ foil: foil.id })} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Face</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CARD_PATTERNS.map((pattern) => (
                <Chip key={pattern.id} label={pattern.label} on={spec.pattern === pattern.id} onClick={() => patch({ pattern: pattern.id })} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LAYER_LABELS.map((layer) => (
                <Chip
                  key={layer.id}
                  label={layer.label}
                  on={spec.layers[layer.id]}
                  onClick={() => patch({ layers: { ...spec.layers, [layer.id]: !spec.layers[layer.id] } })}
                />
              ))}
            </div>
          </section>
          <section className="space-y-3">
            <Slider label="Mark size" min={0.4} max={0.8} step={0.01} value={spec.logoWidth} onChange={(logoWidth) => patch({ logoWidth })} />
            <Slider label="Rank size" min={1} max={2.8} step={0.1} value={spec.rankScale} onChange={(rankScale) => patch({ rankScale })} />
            <Slider label="Edge room" min={16} max={80} step={1} value={spec.bleed} onChange={(bleed) => patch({ bleed })} />
            <Slider label="Overlap" min={0} max={0.4} step={0.01} value={spec.overlap} onChange={(overlap) => patch({ overlap })} />
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setSpec({ ...CARD_DEFAULTS, symbol: spec.symbol, foil: spec.foil, rank: spec.rank, layers: { ...CARD_LAYERS_ON } })}
            >
              Reset this face
            </button>
          </section>

          <section className="border border-border p-3">
            <h2 className="text-sm font-semibold">{copy.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{copy.about}</p>
            <dl className="mt-3 space-y-1 text-xs">
              <Fact label="Rarity" value={copy.rarity} />
              <Fact label="Edition" value={String(foilOf(spec.foil).edition)} />
              <Fact label="Suit" value={foilOf(spec.foil).suitName} />
            </dl>
            {issuer ? (
              <div className="mt-4 space-y-2">
                <label className="block text-xs text-muted-foreground">
                  Send the card to
                  <input className="input mt-1 h-9 font-mono text-sm" value={owner} onChange={(e) => setOwner(e.target.value)} />
                </label>
                <button type="button" className="btn btn-primary btn-sm w-full" disabled={minting} onClick={() => void mint()}>
                  {minting ? "Minting…" : "Mint this card"}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">The issuer mints these cards.</p>
            )}
            {mintErr ? <p className="mt-2 text-xs text-destructive">{mintErr}</p> : null}
            {mintTx && mintTx !== "ok" ? (
              <p className="mt-2 text-xs">
                <TxLink tx={mintTx} />
              </p>
            ) : null}
            {mintTx === "ok" ? <p className="mt-2 text-xs text-muted-foreground">The card was minted.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}

function Slider(props: { label: string; min: number; max: number; step: number; value: number; onChange: (n: number) => void }) {
  const shown = Number.isInteger(props.step) ? String(props.value) : props.value.toFixed(2);
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-muted-foreground">
        <span>{props.label}</span>
        <span className="font-mono text-foreground">{shown}</span>
      </span>
      <input
        type="range"
        className="mt-1 w-full accent-[hsl(var(--primary))]"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

async function cardFile(printed: boolean, src: string, canvas: HTMLCanvasElement | null, spec: CardSettings): Promise<File> {
  const name = `${spec.symbol}-${foilOf(spec.foil).folder}-${spec.rank}.png`;
  if (printed) {
    const res = await fetch(src);
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && blob.size <= 1_048_576) return new File([blob], name, { type: "image/png" });
    }
  }
  if (!canvas) throw new Error("The card picture is not ready.");
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The card picture is not ready.");
  if (blob.size > 1_048_576) throw new Error("This picture is too large to mint. Reset the face and try again.");
  return new File([blob], name, { type: "image/png" });
}
