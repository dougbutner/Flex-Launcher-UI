import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { FlexLogo } from "@/components/FlexLogo";
import { isFlexContractActor } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { walletTypeLabel } from "@/services/walletSessions";

const NAV = [
  { to: "/launch", label: "Launch" },
  { to: "/manager", label: "Dev Tools" },
  { to: "/events", label: "Events" },
  { to: "/insiders", label: "Insiders" },
  { to: "/leaderboard", label: "Winners" },
  { to: "/reflections", label: "Make it Rain" },
  { to: "/portfolio", label: "My Bags" },
];

export function Header({ collapsed, onExpand }: { collapsed: boolean; onExpand: () => void }) {
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
  const nav = [
    ...NAV,
    ...(isFlexContractActor(actor)
      ? [
          { to: "/admin", label: "Admin" },
          { to: "/preview", label: "Preview" },
        ]
      : []),
  ];

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
    <div className={`tetra-top ${collapsed ? "is-collapsed" : ""}`}>
      <header className="tetra-top__bar">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5">
            <FlexLogo gold />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">Flex Forex</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                XPR
              </div>
            </div>
          </Link>

          <nav className="tetra-nav hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `px-3 py-1.5 text-xs font-medium ${
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
                {loading ? "Reconnecting…" : "Connect Wallet"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" disabled={loading} onClick={() => void addAnchorWallet()}>
                Anchor
              </button>
            </>
          )}
        </div>
      </div>

      <nav className="tetra-nav flex items-center gap-1 overflow-x-auto border-t border-white/10 px-4 py-1.5 md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `whitespace-nowrap px-3 py-1 text-[11px] font-medium ${
                isActive ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      </header>
      <button
        type="button"
        className="tetra-top__corner"
        aria-hidden={!collapsed}
        tabIndex={collapsed ? 0 : -1}
        aria-label="Show navigation"
        onClick={onExpand}
      >
        <span className="tetra-top__mark">
          <FlexLogo gold />
        </span>
      </button>
    </div>
  );
}
