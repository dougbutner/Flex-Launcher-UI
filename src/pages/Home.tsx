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
    body: "You go live on a real market with a price range, not a fake curve people snipe. Tokens start on Alcor with a fee, ticks, and a starting price.",
  },
  {
    id: "mining",
    title: "Pure Liquid Mining",
    body: "Every token goes in the pool. Nobody keeps a stash on the side. Liftoff waits until the full supply is on swap.alcor.",
  },
  {
    id: "lock",
    title: "Locked Pools",
    body: "The pool stays locked at least 90 days, often longer. You cannot go live today and pull the money this afternoon.",
  },
  {
    id: "holders",
    title: "Holders Get Paid",
    body: "Trades can pay people who hold. Some of that can burn, or go to the project. Anyone can press makeitrain.",
  },
  {
    id: "flex",
    title: "Rewards Flex",
    body: "Your payout does not have to stay in this ticker. Take it as native, BTC, XRP, or another listed asset.",
  },
  {
    id: "identity",
    title: "True Identity",
    body: "A token is contract plus symbol, not just FOO. Launch against EASY, WON, GRAMS, MEME, or a proven xtoken.",
  },
  {
    id: "skim",
    title: "Tiny Skim",
    body: "The house takes little or nothing. Flex quotes launch at 0%. Other quotes take a small 0.5%.",
  },
  {
    id: "rock",
    title: "Choose Your Rock",
    body: "Reflect with easyflex. Project fees and inheritance with complexflex. Jackpots and angel numbers with flexforex. Pick a backing token and lock 100%.",
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
          <div className="home-hero__tex home-tex home-tex--field" data-parallax="0.18" />
          <div className="home-hero__mark" />
        </div>
        <h1 className="home-hero__title">
          Pure Liquid
          <br />
          Mining
        </h1>
        <p className="home-hero__standfirst">
          Every token goes in the pool. Liftoff waits until the full supply is on Alcor.
        </p>
        <p className="home-hero__cta">
          <Link className="home-cta" to="/launch">
            Launch a token
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
              <div
                className={`home-tex ${i % 2 === 0 ? "home-tex--field" : "home-tex--tess"}`}
                data-parallax="0.16"
              />
            </div>
            <h2 className="home-spread__title">{item.title}</h2>
            <p className="home-spread__body">{item.body}</p>
          </article>
        );
      })}

      <section className="home-close">
        <div className="home-close__tex home-tex home-tex--trim" data-parallax="0.1" aria-hidden />
        <h2 className="home-close__title">Open the launcher</h2>
        <p className="home-close__body">Create the token, fill the pool, lock it, then liftoff.</p>
        <Link className="home-cta" to="/launch">
          Launch a token
        </Link>
      </section>
    </div>
  );
}
