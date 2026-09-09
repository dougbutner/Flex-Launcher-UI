/** Deterministic cartoon dog portrait per ticker (no network). */

const COATS = [
  "#c4a574",
  "#8b5a2b",
  "#f5e6c8",
  "#3d2914",
  "#e8d5b7",
  "#6b4423",
  "#d4a574",
  "#2c1810",
  "#f0c987",
  "#a67c52",
];

const ACCENTS: Record<string, string> = {
  XBTC: "#f7931a",
  XXRP: "#23292f",
  XETH: "#627eea",
  XUSDC: "#2775ca",
  XUSDT: "#26a17b",
  XDOGE: "#c2a633",
  XSOL: "#9945ff",
  METAL: "#c0c0c0",
  XBNB: "#f3ba2f",
  XXLM: "#000000",
  XHBAR: "#000000",
  XADA: "#0033ad",
  XLTC: "#345d9d",
  XBCH: "#8dc351",
  XPAXG: "#d4af37",
  XMT: "#22c55e",
  FOOBAR: "#ec4899",
};

function hashSym(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
  return h;
}

type Props = {
  symbol: string;
  className?: string;
  size?: number;
};

export function DogAvatar({ symbol, className = "", size = 56 }: Props) {
  const h = hashSym(symbol);
  const coat = COATS[h % COATS.length];
  const accent = ACCENTS[symbol] ?? COATS[(h >> 3) % COATS.length];
  const earStyle = h % 3; // 0 pointed, 1 floppy, 2 round
  const snout = h % 2; // 0 short, 1 long
  const id = `dog-${symbol}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={`${symbol} dog`}
    >
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.08" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-bg)`} />
      {/* ears */}
      {earStyle === 0 ? (
        <>
          <ellipse cx="14" cy="18" rx="7" ry="14" fill={coat} transform="rotate(-18 14 18)" />
          <ellipse cx="50" cy="18" rx="7" ry="14" fill={coat} transform="rotate(18 50 18)" />
        </>
      ) : earStyle === 1 ? (
        <>
          <ellipse cx="12" cy="28" rx="9" ry="14" fill={coat} transform="rotate(-35 12 28)" />
          <ellipse cx="52" cy="28" rx="9" ry="14" fill={coat} transform="rotate(35 52 28)" />
        </>
      ) : (
        <>
          <circle cx="16" cy="16" r="9" fill={coat} />
          <circle cx="48" cy="16" r="9" fill={coat} />
        </>
      )}
      {/* head */}
      <ellipse cx="32" cy="34" rx="18" ry="16" fill={coat} />
      {/* snout */}
      <ellipse
        cx="32"
        cy={snout ? 42 : 40}
        rx={snout ? 10 : 8}
        ry={snout ? 8 : 6}
        fill="#f3e4d0"
      />
      <ellipse cx="32" cy={snout ? 44 : 41} rx="3" ry="2.2" fill="#1a120b" />
      {/* eyes */}
      <circle cx="25" cy="32" r="2.4" fill="#1a120b" />
      <circle cx="39" cy="32" r="2.4" fill="#1a120b" />
      <circle cx="25.7" cy="31.3" r="0.7" fill="#fff" />
      <circle cx="39.7" cy="31.3" r="0.7" fill="#fff" />
      {/* collar tag */}
      <rect x="24" y="48" width="16" height="5" rx="2" fill={accent} />
      <text
        x="32"
        y="52"
        textAnchor="middle"
        fontSize="4"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fill="#fff"
      >
        {symbol.slice(0, 4)}
      </text>
    </svg>
  );
}
