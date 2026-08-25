import { useState } from "react";
import { walletTypeLabel, type LoadedWallet } from "@/services/walletSessions";

interface HeaderProps {
  actor: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  wallets: LoadedWallet[];
  activeId: string | null;
  onAddWebAuth: () => Promise<unknown>;
  onAddAnchor: () => Promise<unknown>;
  onSetActive: (id: string) => void;
  onRemoveWallet: (id: string) => Promise<void>;
  onDisconnectAll: () => Promise<void>;
}

export function Header({
  actor,
  isLoggedIn,
  loading,
  wallets,
  activeId,
  onAddWebAuth,
  onAddAnchor,
  onSetActive,
  onRemoveWallet,
  onDisconnectAll,
}: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const copyActor = () => {
    if (!actor) return;
    void navigator.clipboard.writeText(actor).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <span className="text-lg font-bold text-primary-foreground">X</span>
        </div>
        <h1 className="text-xl font-semibold">XPR Network game template</h1>
      </div>

      <div className="flex items-center gap-2">
        {isLoggedIn && actor ? (
          <details className="relative">
            <summary className="btn btn-outline btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="max-w-[140px] truncate">{actor}</span>
              <span aria-hidden>▾</span>
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border bg-popover p-2 shadow-md">
              <div className="flex items-center gap-2 px-2 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{actor}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copyActor}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <hr className="my-2 border-border" />
              <p className="px-2 text-xs uppercase tracking-wide text-muted-foreground">Connected wallets</p>
              <ul className="mt-1 max-h-64 overflow-y-auto">
                {wallets.map((w) => {
                  const active = w.id === activeId;
                  return (
                    <li key={w.id} className="flex items-center gap-2 rounded px-2 py-2 hover:bg-accent">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onSetActive(w.id)}
                      >
                        <div className="truncate font-medium">
                          {w.provider === "webauth" ? w.auth.actor : w.actor}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{walletTypeLabel(w)}</div>
                      </button>
                      {active && <span className="text-xs text-primary">active</span>}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-muted-foreground hover:text-destructive"
                        aria-label="Disconnect wallet"
                        onClick={() => void onRemoveWallet(w.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <hr className="my-2 border-border" />
              <button type="button" className="btn btn-outline btn-sm mb-2 w-full" onClick={() => void onAddWebAuth()}>
                + WebAuth / mobile
              </button>
              <button type="button" className="btn btn-outline btn-sm mb-2 w-full" onClick={() => void onAddAnchor()}>
                + Anchor
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm w-full text-muted-foreground hover:text-destructive"
                onClick={() => void onDisconnectAll()}
              >
                Disconnect all
              </button>
            </div>
          </details>
        ) : (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => void onAddWebAuth()}>
              {loading ? "Restoring…" : "WebAuth / mobile"}
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => void onAddAnchor()}>
              Anchor
            </button>
          </>
        )}
      </div>
    </header>
  );
}
