import { useState } from "react";
import "./FlexLogo.css";

const TOKENS = [
  { src: "/tokens/easy.png", id: "easy" },
  { src: "/tokens/won.png", id: "won" },
  { src: "/tokens/meme.png", id: "meme" },
  { src: "/tokens/grams.png", id: "grams" },
] as const;

export function FlexLogo() {
  const [token] = useState(() => TOKENS[Math.floor(Math.random() * TOKENS.length)]);

  return (
    <span className="flex-logo" aria-hidden>
      <img className={`flex-logo__img flex-logo__img--${token.id}`} src={token.src} alt="" />
    </span>
  );
}
