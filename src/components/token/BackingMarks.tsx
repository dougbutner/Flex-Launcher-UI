import { TokenIcon } from "@/components/TokenIcon";

type Mark = {
  symbol: string;
  contract: string;
  href?: string;
  title?: string;
};

/** Overlapping backing logos in about the space of one icon. First of each symbol wins. */
export function BackingMarks({ marks, size = 28 }: { marks: Mark[]; size?: number }) {
  const icons: Mark[] = [];
  const seen = new Set<string>();
  for (const mark of marks) {
    const sym = mark.symbol.toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    icons.push(mark);
  }
  if (!icons.length) return null;
  const step = icons.length > 1 ? Math.max(8, Math.round(size * 0.42)) : 0;
  const width = size + step * (icons.length - 1);
  return (
    <span
      className="relative inline-block shrink-0 align-middle"
      style={{ width, height: size }}
      aria-label={icons.map((mark) => mark.symbol).join(", ")}
    >
      {icons.map((mark, i) => {
        const icon = (
          <TokenIcon
            contract={mark.contract}
            symbol={mark.symbol}
            size={size}
            className="ring-2 ring-background"
          />
        );
        const style = { position: "absolute" as const, left: i * step, top: 0, zIndex: i + 1 };
        return mark.href ? (
          <a
            key={mark.symbol}
            href={mark.href}
            target="_blank"
            rel="noreferrer"
            title={mark.title || mark.symbol}
            style={style}
            className="block"
          >
            {icon}
          </a>
        ) : (
          <span key={mark.symbol} title={mark.title || mark.symbol} style={style} className="block">
            {icon}
          </span>
        );
      })}
    </span>
  );
}
