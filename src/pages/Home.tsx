import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Amount } from "@/components/Amount";
import { ShareGauge } from "@/components/token/StatShapes";
import { Pulse } from "@/components/ui/Pulse";
import { loadEasyDominance, loadHomeCounts, type HomeCounts } from "@/services/homeDash";
import { fmtHolders } from "@/services/winnerBoard";
import "./Home.css";

const GOLDS = ["#c4a035", "#d4af37", "#e0b84a", "#b8952a", "#c9a227"] as const;
const LIGHTS = ["#ffe566", "#fff1a8", "#fff8d0", "#ffef9a"] as const;
const TOUCHES = ["#22c55e", "#8b5cf6", "#ffe566"] as const;

function pickHex(list: readonly string[]) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickWash() {
  return {
    gold: pickHex(GOLDS),
    light: pickHex(LIGHTS),
    touch: pickHex(TOUCHES),
    x: 10 + Math.floor(Math.random() * 72),
    y: 8 + Math.floor(Math.random() * 70),
  };
}

function plateStyle(wash: ReturnType<typeof pickWash>) {
  return {
    background: `radial-gradient(ellipse at ${wash.x}% ${wash.y}%, ${wash.gold} 0%, transparent 54%), radial-gradient(ellipse at ${100 - wash.x}% ${100 - wash.y}%, ${wash.light} 0%, transparent 46%), #0b0f0b`,
    boxShadow: `inset 0 0 90px ${wash.touch}22`,
  };
}

const BENEFITS = [
  {
    id: "economics",
    title: "Sane economics",
    body: "You go live on a real market with a price range, no unplanned curve snipers love to pump and dump. Tokens start on Alcor with a fee you earn 100% of, and a price range you choose.",
    image: "/home/pure-liquid-tokenomics.jpg",
    href: "https://flex.report",
    hrefLabel: "Dive deep",
  },
  {
    id: "mining",
    title: "Pure Liquid Mining",
    body: "Every token is bought out of the pool. Nobody keeps a stash on the side, no \"premine\" or sketchy allocations. Fair launch in the DNA.",
    image: "/home/pure-liquid-tokenomics.jpg",
  },
  {
    id: "lock",
    title: "Locked Pools",
    body: "The pool stays locked at least 91 days, and we hope you choose longer to show you community the liquidity they put in is here for them.",
    image: "/home/locked-pools.jpg",
  },
  {
    id: "holders",
    title: "Diamond Hands Get Rained On",
    body: "Making it rain is paying people who hold. This comes from a transfer fee you set. You also choose what % is burnt, goes to the project, or is given as special jackpots and Angel rewards. Anyone can call in the rain to drench your holders.",
    image: "/home/diamond-hands.jpg",
  },
  {
    id: "flex",
    title: "Rewards Flex",
    body: "Holder payout is flexible. Holders can choose your token, BTC, XRP, or another asset. You set up pools and add options.",
    image: "/home/rewards-flex.jpg",
  },
  {
    id: "identity",
    title: "Old tokens with a new face",
    body: "Link your token with BTC, DOGE, or many more. Launch tokens backed by EASY, XRP, SOL, and you can set the default reflection to be the backing-asset if you prefer (default is your token as the interest).",
    image: "/home/old-tokens.jpg",
  },
  {
    id: "skim",
    title: "House Cut",
    body: "We're generous, and you might never have to pay a fee. Tokens backed by EASY, WON, GRAMS or MEME launch at 0%. Others take a small 0.5% of the reflection pool each time it rains, and all take 0.5% when the lock expires (if you don't extend the lock).",
    image: "/home/house-cut.jpg",
  },
  {
    id: "rock",
    title: "Choose Your Tech",
    body: "Reflect on 3asy. Project fees and inheritance on fl3x. Jackpots and angel numbers on for3x. Choose your backing token to serve as your rock.",
    image: "/home/choose-your-tech.jpg",
  },
] as const;

const SWIMMERS = [
  { x: 230, delay: "0s", body: "#22c55e", head: "#ffe566", lift: -18 },
  { x: 390, delay: "-0.6s", body: "#d4af37", head: "#fff1a8", lift: -8 },
  { x: 560, delay: "-1.3s", body: "#8b5cf6", head: "#f4f7f4", lift: -14 },
  { x: 740, delay: "-0.2s", body: "#22c55e", head: "#ffe566", lift: -6 },
] as const;

/** Site logos, the same files the rest of the app shows. */
const RAIN = [
  { src: "/tokens/easy.png", x: 128, y: 140, s: 46, delay: "0s", dur: "4.6s" },
  { src: "/tokens/eosio.token/XPR.png", x: 448, y: 108, s: 34, delay: "-1.2s", dur: "5.2s" },
  { src: "/tokens/xtokens/XBTC.png", x: 668, y: 138, s: 40, delay: "-2.4s", dur: "4.2s" },
  { src: "/tokens/meme.png", x: 848, y: 168, s: 30, delay: "-0.8s", dur: "5.6s" },
  { src: "/tokens/won.png", x: 280, y: 186, s: 32, delay: "-3s", dur: "4.8s" },
  { src: "/tokens/grams.png", x: 300, y: 292, s: 36, delay: "-1.6s", dur: "5.4s" },
  { src: "/tokens/fl3x/GEASY.png", x: 482, y: 278, s: 42, delay: "-0.4s", dur: "4.4s" },
  { src: "/tokens/won.png", x: 644, y: 300, s: 30, delay: "-2.8s", dur: "5s" },
  { src: "/tokens/easy.png", x: 800, y: 304, s: 34, delay: "-1.4s", dur: "4.9s" },
] as const;

const HOLO_MARKS: Record<string, readonly string[]> = {
  EASY: ["chevron", "classic", "diamond", "hex-spark", "pentagon", "rings-spark", "shards-spark", "square", "star", "triangle-spark"],
  MEME: ["chevron-spark", "classic", "diamond-spark", "hex-spark", "pentagon-spark", "rings", "shards-spark", "square", "star-spark", "triangle"],
  WON: ["chevron-spark", "classic", "diamond", "hex", "pentagon-spark", "rings-spark", "shards", "square", "star-spark", "triangle"],
  GRAMS: ["chevron-spark", "classic", "diamond", "hex", "pentagon", "rings", "shards-spark", "square-spark", "star-spark", "triangle-spark"],
  XBTC: ["chevron-spark", "classic", "diamond", "hex", "pentagon", "rings-spark", "shards", "square", "star-spark", "triangle-spark"],
  XETH: ["chevron", "classic", "diamond-spark", "hex", "pentagon-spark", "rings", "shards", "square-spark", "star", "triangle"],
  XSOL: ["chevron", "classic", "diamond", "hex", "pentagon", "rings", "shards-spark", "square", "star-spark", "triangle-spark"],
  XDOGE: ["chevron-spark", "classic", "diamond-spark", "hex-spark", "pentagon-spark", "rings-spark", "shards", "square", "star", "triangle-spark"],
  XXRP: ["chevron-spark", "classic", "diamond-spark", "hex", "pentagon-spark", "rings-spark", "shards", "square", "star-spark", "triangle-spark"],
};

const HOLO_CARDS = [
  ["EASY", "diamond", "A"],
  ["EASY", "gold", "K"],
  ["MEME", "rose-gold", "Q"],
  ["WON", "rose-silver", "J"],
  ["BTC", "diamond", "A"],
  ["BTC", "gold", "10"],
] as const;

type HoloSlide = { src: string; label: string; card: boolean };

function holoCatalog(): HoloSlide[] {
  const rows: HoloSlide[] = [];
  for (const [symbol, marks] of Object.entries(HOLO_MARKS)) {
    rows.push({ src: `/tokens/xtokenpng/512holoxtokens/${symbol}.png`, label: symbol, card: false });
    for (const mark of marks) {
      rows.push({ src: `/tokens/xtokenpng/256geomshimmer/${symbol}-${mark}.png`, label: symbol, card: false });
    }
  }
  for (const [symbol, foil, rank] of HOLO_CARDS) {
    rows.push({ src: `/holo-cards/${symbol}/${foil}/${rank}.png`, label: `${symbol} ${rank}`, card: true });
  }
  return rows;
}

const HOLO_POOL = holoCatalog();

function shuffle<T>(rows: T[], rand: () => number) {
  const copy = rows.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function pickHoloSlides(rand: () => number = Math.random): HoloSlide[] {
  const cards = shuffle(HOLO_POOL.filter((row) => row.card), rand).slice(0, 4);
  const marks = shuffle(HOLO_POOL.filter((row) => !row.card), rand).slice(0, 8);
  return shuffle([...cards, ...marks], rand);
}

function LiquidityScene() {
  return (
    <svg className="home-pool" viewBox="0 0 1000 420" preserveAspectRatio="xMinYMid meet" aria-hidden>
      <g className="home-pool__cloud home-pool__cloud--a">
        <ellipse cx="120" cy="58" rx="46" ry="18" />
        <ellipse cx="156" cy="48" rx="34" ry="20" />
        <ellipse cx="190" cy="60" rx="40" ry="16" />
      </g>
      <g className="home-pool__cloud home-pool__cloud--b">
        <ellipse cx="470" cy="42" rx="52" ry="18" />
        <ellipse cx="512" cy="30" rx="36" ry="20" />
        <ellipse cx="548" cy="44" rx="42" ry="16" />
      </g>
      <g className="home-pool__cloud home-pool__cloud--c">
        <ellipse cx="800" cy="70" rx="44" ry="16" />
        <ellipse cx="836" cy="58" rx="32" ry="18" />
        <ellipse cx="868" cy="72" rx="36" ry="14" />
      </g>

      {RAIN.filter((drop) => drop.y < 250).map((drop) => (
        <image
          key={`${drop.src}-${drop.x}`}
          className="home-pool__ball"
          href={drop.src}
          x={drop.x}
          y={drop.y}
          width={drop.s}
          height={drop.s}
          style={{ animationDelay: drop.delay, animationDuration: drop.dur }}
        />
      ))}

      <ellipse cx="500" cy="318" rx="430" ry="72" fill="#14532d" />
      <ellipse cx="500" cy="308" rx="390" ry="48" fill="#166534" />

      {SWIMMERS.map((swimmer) => (
        <g key={swimmer.x} className="home-pool__person" style={{ animationDelay: swimmer.delay }}>
          <circle cx={swimmer.x} cy={252} r="13" fill={swimmer.head} />
          <rect x={swimmer.x - 12} y={264} width="24" height="72" rx="10" fill={swimmer.body} />
          <path
            d={`M${swimmer.x - 12} 278l-16 ${swimmer.lift}M${swimmer.x + 12} 278l16 ${swimmer.lift + 6}`}
            fill="none"
            stroke={swimmer.head}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      ))}

      <ellipse cx="500" cy="340" rx="430" ry="52" fill="#166534" />
      <ellipse cx="500" cy="328" rx="360" ry="22" fill="#22c55e" opacity="0.35" />

      {RAIN.filter((drop) => drop.y >= 250).map((drop) => (
        <image
          key={`${drop.src}-${drop.x}`}
          className="home-pool__ball"
          href={drop.src}
          x={drop.x}
          y={drop.y}
          width={drop.s}
          height={drop.s}
          style={{ animationDelay: drop.delay, animationDuration: drop.dur }}
        />
      ))}
    </svg>
  );
}

function HoloStrip() {
  const railRef = useRef<HTMLDivElement>(null);
  const [slides, setSlides] = useState<HoloSlide[] | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let live = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || !live) return;
        setSlides((cur) => cur ?? pickHoloSlides());
        io.disconnect();
      },
      { rootMargin: "240px" },
    );
    io.observe(rail);
    return () => {
      live = false;
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !slides?.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let hold = 0;
    const pause = () => {
      hold = performance.now() + 2800;
    };
    const step = () => {
      if (performance.now() > hold && rail.scrollWidth > rail.clientWidth) {
        rail.scrollLeft += 0.55;
        if (rail.scrollLeft >= rail.scrollWidth / 2) rail.scrollLeft = 0;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    rail.addEventListener("pointerdown", pause);
    rail.addEventListener("wheel", pause, { passive: true });
    rail.addEventListener("touchstart", pause, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      rail.removeEventListener("pointerdown", pause);
      rail.removeEventListener("wheel", pause);
      rail.removeEventListener("touchstart", pause);
    };
  }, [slides]);

  const row = slides ? [...slides, ...slides] : [];

  return (
    <section className="home-holo" aria-label="Holographic tokens">
      <div className="home-holo__head">
        <h2 className="home-holo__title">Holographic tokens</h2>
        <p className="home-holo__blurb">Swipe the foil marks and the playing cards.</p>
      </div>
      <div className="home-holo__rail" ref={railRef}>
        {row.length === 0
          ? Array.from({ length: 6 }, (_, i) => <Pulse key={i} className="home-holo__ghost" />)
          : row.map((slide, i) => (
              <figure key={`${slide.src}-${i}`} className={`home-holo__card${slide.card ? " is-card" : ""}`} aria-hidden={i >= 12 ? true : undefined}>
                <img
                  src={slide.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback === "1") {
                      img.closest("figure")?.remove();
                      return;
                    }
                    img.dataset.fallback = "1";
                    img.src = `/tokens/xtokenpng/512holoxtokens/${slide.label.split(" ")[0]}.png`;
                  }}
                />
              </figure>
            ))}
      </div>
    </section>
  );
}

function countText(n: number | null) {
  if (n == null) return "-";
  if (n <= 0) return "0";
  return fmtHolders(n);
}

export default function Home() {
  const wash = useMemo(() => pickWash(), []);
  const plates = useMemo(() => BENEFITS.map(() => pickWash()), []);
  const [counts, setCounts] = useState<HomeCounts | null>(null);
  const [dominance, setDominance] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".home-hero, .home-holo, .home-spread, .home-close")
    );
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add("is-in");
        }
      },
      { threshold: 0.16 }
    );
    for (const section of sections) io.observe(section);

    if (reduce) {
      for (const section of sections) section.classList.add("is-in");
      return () => io.disconnect();
    }

    const layers = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    let raf = 0;
    const tick = () => {
      const vh = window.innerHeight;
      for (const el of layers) {
        const speed = Number(el.dataset.parallax) || 0.12;
        const box = el.getBoundingClientRect();
        const mid = box.top + box.height / 2 - vh / 2;
        el.style.transform = `translate3d(0, ${(-mid * speed).toFixed(2)}px, 0)`;
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    tick();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    let live = true;
    void loadHomeCounts().then((row) => {
      if (live) setCounts(row);
    });
    void loadEasyDominance().then((ratio) => {
      if (live) setDominance(ratio);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div
      className="home"
      style={{
        ["--home-gold" as string]: wash.gold,
        ["--home-light" as string]: wash.light,
        ["--home-touch" as string]: wash.touch,
        ["--home-gx" as string]: `${wash.x}%`,
        ["--home-gy" as string]: `${wash.y}%`,
      }}
    >
      <div className="home-glow" aria-hidden />
      <div className="home-field" data-parallax="0.08" aria-hidden />

      <section className="home-hero" aria-label="Flex dashboard">
        <div className="home-hero__mesh" aria-hidden />
        <div className="home-hero__wash" aria-hidden />
        <h1 className="home-hero__title">
          Your Token
          <br />
          is Pure Liquid
        </h1>
        <LiquidityScene />
        <div className="home-dash">
          <div className="home-dash__lead">
            <Link className="home-trade" to="/leaderboard">
              Trade now
              <ArrowUpRight aria-hidden size={18} strokeWidth={2.25} />
            </Link>
            <p className="home-dash__blurb">
              Locked by EASY, XPR, and XBTC. The full supply is priced and protected on Alcor. Trade day 1.
            </p>
          </div>
          <div className="home-dash__stats">
            <div className="home-stat">
              <div className="home-stat__label">30 day transactions</div>
              <div className="home-stat__value">
                {counts ? countText(counts.tx30) : <Pulse className="mt-1 h-7 w-14" />}
              </div>
            </div>
            <div className="home-stat home-stat--gauge">
              <div className="home-stat__label">EASY dominance on Alcor</div>
              <div className="home-stat__value">
                {dominance === undefined ? (
                  <Pulse className="mt-1 h-14 w-24" />
                ) : (
                  <ShareGauge ratio={dominance} label="EASY dominance on Alcor" />
                )}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat__label">Volume</div>
              <div className="home-stat__value">
                {counts ? <Amount value={counts.volumeUsd ?? 0} kind="usd" /> : <Pulse className="mt-1 h-7 w-16" />}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat__label">Tokens launched</div>
              <div className="home-stat__value home-stat__pair">
                {counts ? (
                  <>
                    <span>{countText(counts.launched)}</span>
                    <span className="home-stat__side">
                      <span className="home-stat__side-n">{countText(counts.presale)}</span>
                      <span className="home-pre">PRE</span>
                    </span>
                  </>
                ) : (
                  <Pulse className="mt-1 h-7 w-16" />
                )}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat__label">Holders</div>
              <div className="home-stat__value">
                {counts ? countText(counts.holders) : <Pulse className="mt-1 h-7 w-12" />}
              </div>
            </div>
            <div className="home-stat">
              <div className="home-stat__label">24h transactions</div>
              <div className="home-stat__value">
                {counts ? countText(counts.tx24) : <Pulse className="mt-1 h-7 w-14" />}
              </div>
            </div>
          </div>
        </div>
      </section>

      <HoloStrip />

      {BENEFITS.map((item, i) => {
        const side = i % 2 === 0 ? "a" : "b";
        return (
          <article
            key={item.id}
            id={item.id}
            className={`home-spread home-spread--${side}`}
          >
            <div className="home-spread__plate" style={plateStyle(plates[i])}>
              <img className="home-art" src={item.image} alt="" />
            </div>
            <h2 className="home-spread__title">{item.title}</h2>
            <div className="home-spread__body">
              <p>{item.body}</p>
              {"href" in item && item.href ? (
                <a className="home-cta home-spread__cta" href={item.href} target="_blank" rel="noreferrer">
                  {item.hrefLabel}
                </a>
              ) : null}
            </div>
          </article>
        );
      })}

      <section className="home-close">
        <div className="home-close__plate">
          <img className="home-art" src="/home/prepare-for-liftoff.jpg" alt="Prepare for liftoff" />
        </div>
        <h2 className="home-close__title">Prepare for Liftoff</h2>
        <p className="home-close__body">Create the token, fill the pool, lock it, and liftoff.</p>
        <Link className="home-cta" to="/launch">
          Launch your token
        </Link>
      </section>
    </div>
  );
}
