import type { ReactNode } from "react";
import { explorerTx } from "@/config/launch";
import { SUPPLY_SHORTCUTS } from "@/services/assets";

export function SupplyShortcuts(props: { value: string; onPick: (value: string) => void }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs font-semibold">
      {SUPPLY_SHORTCUTS.map((s) => (
        <button
          key={s.label}
          type="button"
          className={`link ${props.value === s.value ? "text-primary" : ""}`}
          onClick={() => props.onPick(s.value)}
        >
          {s.label}
        </button>
      ))}
    </span>
  );
}

export function Field(props: {
  label: string;
  hint?: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
  /** Sentence-case labels instead of the default uppercase chip style. */
  sentence?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-3">
        <span className={props.sentence ? "mb-0 block text-sm font-semibold text-foreground" : "label mb-0"}>
          {props.label}
        </span>
        {props.aside}
      </div>
      {props.children}
      {props.error ? (
        <p className="mt-1.5 text-xs font-medium text-destructive">{props.error}</p>
      ) : props.hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{props.hint}</p>
      ) : null}
    </div>
  );
}

export function StepShell(props: {
  title: string;
  desc: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight">{props.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{props.desc}</p>
      <div className="mt-6 space-y-5">{props.children}</div>
      {props.footer ? <div className="mt-8 flex items-center justify-between gap-3">{props.footer}</div> : null}
    </section>
  );
}

export function TxLink({ tx, prefix = "" }: { tx: string; prefix?: string }) {
  if (!tx || tx === "skipped") return <span className="text-xs text-muted-foreground">skipped</span>;
  const label = `${prefix}${tx.slice(0, 10)}…`;
  if (!/^[0-9a-fA-F]{16,}$/.test(tx)) {
    return <span className="font-mono text-xs text-success">{prefix}{tx}</span>;
  }
  return (
    <a href={explorerTx(tx)} target="_blank" rel="noopener noreferrer" className="link font-mono text-xs text-success">
      {label}
    </a>
  );
}

export function StatusIcon({ state }: { state: "done" | "active" | "todo" | "error" }) {
  if (state === "done")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (state === "active")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      </span>
    );
  if (state === "error")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </span>
    );
  return <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border" />;
}
