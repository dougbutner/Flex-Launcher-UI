import type { CSSProperties } from "react";

export function Pulse({ className, style }: { className: string; style?: CSSProperties }) {
  return <div className={`animate-pulse bg-secondary ${className}`} style={style} aria-hidden />;
}
