import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
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

export default function Home() {
  const wash = useMemo(() => pickWash(), []);
  const plates = useMemo(() => BENEFITS.map(() => pickWash()), []);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".home-hero, .home-spread, .home-close")
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

      <section className="home-hero" aria-label="Flex launcher">
        <div className="home-hero__plate" style={plateStyle(wash)}>
          <img className="home-art" src="/home/your-token-is-pure-liquid.jpg" alt="Your token is pure liquid" />
        </div>
        <h1 className="home-hero__title">
          Your Token
          <br />
          is Pure Liquid
        </h1>
        <p className="home-hero__standfirst">
          Your Flex token is locked by trusted tokens like EASY, XPR, and XBTC. Liftoff process guides you to price and
          protect the full supply on Alcor, crafting your fair launch. Trade day 1.
        </p>
        <p className="home-hero__cta">
          <Link className="home-cta" to="/launch">
            Launch your token
          </Link>
        </p>
      </section>

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
