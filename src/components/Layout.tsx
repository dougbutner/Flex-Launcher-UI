import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="relative z-30 overflow-visible border-t px-6 py-4">
        <NetworkSwitcher />
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
          Liquidity seeded on{" "}
          <a href="https://alcor.exchange/v/xpr/" target="_blank" rel="noopener noreferrer" className="link">
            Alcor
          </a>
        </p>
      </footer>
    </div>
  );
}
