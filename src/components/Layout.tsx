import { Outlet } from "react-router-dom";
import { Header } from "@/components/Header";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { TokenIcon } from "@/components/TokenIcon";
import {
  EOSIO_TOKEN,
  EASY_SYMBOL,
  MON3Y,
  PROJECT_CORE_TOKENS,
  XPR_SYMBOL,
  alcorAnalyticsUrl,
  alcorSwapUrl,
} from "@/config/launch";

const EASY_SWAP = alcorSwapUrl(XPR_SYMBOL, EOSIO_TOKEN, EASY_SYMBOL, MON3Y);
const DOCS = "https://flex.report";
const REDDIT = "https://www.reddit.com/r/PureLiquid/";
const X_URL = "https://x.com/flextokens";
const TELEGRAM = "https://t.me/flextokens";

function XMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M21.94 4.46 18.7 20.28c-.24 1.08-.88 1.34-1.78.84l-4.92-3.63-2.37 2.28c-.26.26-.48.48-.98.48l.35-4.98 9.07-8.2c.4-.35-.08-.54-.61-.2L6.1 13.26 1.28 11.76c-1.05-.33-1.07-1.05.23-1.56L20.5 3.7c.87-.33 1.64.2 1.44.76z"
      />
    </svg>
  );
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="relative z-30 overflow-visible border-t px-6 py-4">
        <NetworkSwitcher />
        <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <a href={DOCS} target="_blank" rel="noopener noreferrer" className="link">
            docs
          </a>
          <a href={EASY_SWAP} target="_blank" rel="noopener noreferrer" className="link">
            Buy EASY
          </a>
          <a href={REDDIT} target="_blank" rel="noopener noreferrer" className="link">
            Reddit
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="link inline-flex items-center gap-1"
            aria-label="X @flextokens"
          >
            <XMark />
            <span>@flextokens</span>
          </a>
          <a
            href={TELEGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="link inline-flex items-center gap-1"
            aria-label="Telegram @flextokens"
          >
            <TelegramMark />
            <span>@flextokens</span>
          </a>
          <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" className="link">
            support
          </a>
        </nav>
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground/70">
          <span>Analytics</span>
          {PROJECT_CORE_TOKENS.map((t) => (
            <a
              key={`${t.contract}:${t.symbol}`}
              href={alcorAnalyticsUrl(t.symbol, t.contract)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${t.symbol} analytics`}
              className="inline-flex"
            >
              <TokenIcon contract={t.contract} symbol={t.symbol} size={22} />
            </a>
          ))}
        </p>
      </footer>
    </div>
  );
}
