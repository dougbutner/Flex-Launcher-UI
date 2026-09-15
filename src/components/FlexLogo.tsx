import "./FlexLogo.css";

export function FlexLogo({ gold = false, className = "" }: { gold?: boolean; className?: string }) {
  return (
    <span className={`flex-logo ${gold ? "flex-logo--gold" : ""} ${className}`.trim()} aria-hidden>
      <img className="flex-logo__img flex-logo__img--easy" src="/tokens/easy.png" alt="" />
    </span>
  );
}
