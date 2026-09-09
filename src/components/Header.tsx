import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FlexLogo } from "@/components/FlexLogo";
import { useWallet } from "@/hooks/useWallet";
import { walletTypeLabel } from "@/services/walletSessions";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/launch", label: "Launch" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/reflections", label: "Reflections" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/preview", label: "Preview" },
];

export function Header() {
  const {
    actor,
    isLoggedIn,
    loading,
    wallets,
    activeId,
    addWebAuthWallet,
    addAnchorWallet,
    setActive,
    removeWallet,
    disconnectAll,
  } = useWallet();
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const location = useLocation();

  useEffect(() => {
    menuRef.current?.removeAttribute("open");
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        menuRef.current.removeAttribute("open");
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const copyActor = () => {
    if (!actor) return;
    void navigator.clipboard.writeText(actor).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5">
            <FlexLogo />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">Flex Launcher</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                XPR Testnet
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {isLoggedIn && actor ? (
            <details className="relative" ref={menuRef}>
              <summary className="btn btn-outline btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                <span className="max-w-[140px] truncate">{actor}</span>
                <span aria-hidden>▾</span>
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border bg-popover p-2 shadow-xl">
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
                      <li key={w.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-secondary">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setActive(w.id)}
                        >
                          <div className="truncate font-medium">
                            {w.provider === "webauth" ? w.auth.actor : w.actor}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{walletTypeLabel(w)}</div>
                        </button>
                        {active && <span className="text-xs font-semibold text-accent">active</span>}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-muted-foreground hover:text-destructive"
                          aria-label="Disconnect wallet"
                          onClick={() => void removeWallet(w.id)}
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <hr className="my-2 border-border" />
                <button type="button" className="btn btn-outline btn-sm mb-2 w-full" onClick={() => void addWebAuthWallet()}>
                  + WebAuth / mobile
                </button>
                <button type="button" className="btn btn-outline btn-sm mb-2 w-full" onClick={() => void addAnchorWallet()}>
                  + Anchor
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm w-full text-muted-foreground hover:text-destructive"
                  onClick={() => void disconnectAll()}
                >
                  Disconnect all
                </button>
              </div>
            </details>
          ) : (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={loading} onClick={() => void addWebAuthWallet()}>
                {loading ? "Restoring…" : "Connect WebAuth"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => void addAnchorWallet()}>
                Anchor
              </button>
            </>
          )}
        </div>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto border-t px-4 py-1.5 md:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
