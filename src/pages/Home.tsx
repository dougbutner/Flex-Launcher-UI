import { Link } from "react-router-dom";
import "./Home.css";

const BENEFITS = [
  {
    id: "amm",
    n: "01",
    title: "Real AMM",
    body: "Tokens go live on Alcor concentrated liquidity with a set fee, ticks, and price. Not a Pump-style curve that exists to be sniped and dumped before graduation.",
  },
  {
    id: "supply",
    n: "02",
    title: "Full supply",
    body: "Until launch, transfers can only hit swap.alcor, and liftoff requires the full supply there. No stealth wallets sitting on inventory.",
  },
  {
    id: "lock",
    n: "03",
    title: "Locked LP",
    body: "lockpos is a hard gate. You cannot pull the rug the same afternoon you launch. Liquidity stays locked 90 days or more.",
  },
  {
    id: "holders",
    n: "04",
    title: "Holders get paid",
    body: "On-chain tax funds reflections (and burn or project, depending on contract). Anyone can trigger makeitrain.",
  },
  {
    id: "flex",
    n: "05",
    title: "Rewards flex",
    body: "Holders pick an Alcor pool via choosereward. Native or another listed token, instead of sitting in a dead meme ticker.",
  },
  {
    id: "identity",
    n: "06",
    title: "True identity",
    body: "No ticker-collision theater. You launch against a real quote (EASY / WON / GRAMS / MEME or an xtoken with proof).",
  },
  {
    id: "skim",
    n: "07",
    title: "Tiny skim",
    body: "Flex quotes take 0 at liftoff. Other quotes take 0.25% + 0.25% sticky. Not a platform that eats the launch.",
  },
  {
    id: "products",
    n: "08",
    title: "Three products",
    body: "Simple (easyflex), project + inheritance (complexflex), or forex extras (keepers, angel numbers). Same launch law, not a one-size meme factory.",
  },
] as const;

export default function Home() {
  return (
    <div className="home">
      <section className="home-hero" aria-label="Flex launcher">
        <figure className="home-hero__plate" role="img" aria-label="Darkroom light plate" />
        <p className="home-hero__byline">Flex · XPR</p>
        <p className="home-hero__kicker">Plate 00 · Liftoff</p>
        <h1 className="home-hero__title">
          Real
          <br />
          market
        </h1>
        <p className="home-hero__standfirst">
          Not a bonding-curve casino. A real market at liftoff, with the whole supply locked on Alcor.
        </p>
        <p className="home-hero__cta">
          <Link className="home-cta" to="/launch">
            Launch a token
          </Link>
        </p>
      </section>

      <nav className="home-index" aria-label="Plates">
        {BENEFITS.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.n} {item.title}
          </a>
        ))}
      </nav>

      {BENEFITS.map((item, i) => {
        const side = i % 2 === 0 ? "a" : "b";
        return (
          <article
            key={item.id}
            id={item.id}
            className={`home-spread home-spread--${side}`}
          >
            <figure
              className={`home-spread__plate home-spread__plate--${i + 1}`}
              role="img"
              aria-hidden
            />
            <p className="home-spread__no">Plate {item.n}</p>
            <h2 className="home-spread__title">{item.title}</h2>
            <p className="home-spread__body">{item.body}</p>
          </article>
        );
      })}

      <section className="home-close">
        <p className="home-close__kicker">Next exposure</p>
        <h2 className="home-close__title">Open the launcher</h2>
        <p className="home-close__body">
          Create, mint, startlaunch, seed Alcor, lock, then liftoff. Same path for all three contracts.
        </p>
        <Link className="home-cta" to="/launch">
          Launch a token
        </Link>
      </section>
    </div>
  );
}
