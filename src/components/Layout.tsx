import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t px-6 py-5 text-center text-xs text-muted-foreground">
        <p>
          Flex Launcher on{" "}
          <a href="https://xprnetwork.org" target="_blank" rel="noopener noreferrer" className="link">
            XPR Network
          </a>
          {" · "}Liquidity seeded on{" "}
          <a href="https://alcor.exchange/v/xpr/" target="_blank" rel="noopener noreferrer" className="link">
            Alcor
          </a>
        </p>
      </footer>
    </div>
  );
}
