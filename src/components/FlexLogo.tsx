import "./FlexLogo.css";

const TOKENS = [
  { src: "/tokens/easy.png", cycle: "a" },
  { src: "/tokens/won.png", cycle: "b" },
  { src: "/tokens/grams.png", cycle: "c" },
  { src: "/tokens/meme.png", cycle: "d" },
] as const;

export function FlexLogo() {
  return (
    <span className="flex-logo" aria-hidden>
      <span className="flex-logo__glow" />
      <span className="flex-logo__stage">
        <span className="flex-logo__spin">
          {TOKENS.map((t) => (
            <img key={t.cycle} className={`flex-logo__img flex-logo__img--${t.cycle}`} src={t.src} alt="" />
          ))}
        </span>
      </span>
      <span className="flex-logo__rim" />
      <span className="flex-logo__flash" />
    </span>
  );
}
