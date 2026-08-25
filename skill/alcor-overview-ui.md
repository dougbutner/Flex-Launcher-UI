# Alcor — product overview & UI

Part of the **[Alcor skill split](alcor-exchange.md)**. Authoritative updates: [docs.alcor.exchange](https://docs.alcor.exchange/), [llms-full.txt](https://docs.alcor.exchange/llms-full.txt). Not financial advice.

## What Alcor is

- **EOSIO/Antelope** DEX—strong on **WAX**; also **EOS, Telos, BOS, Proton (XPR)**.
- Self-list markets—no whitelist gate.
- Docs surface: **AMM + concentrated liquidity**, **orderbook**, **farms**, **limit/market** (Markets tab), **OTC**, **NFT** (may be WIP), token/pair creation, wallet view.

## UI map (desktop)

| Area | Role |
|------|------|
| **Swap** | AMM (“market-style” via pools), charts, pool liquidity |
| **Markets** | Pairs, open market → **Market Exchange** (book + TradingView) |
| **OTC** | User offers (may be WIP) |
| **NFT** | Marketplace (may be WIP) |
| **Wallet** | Balances; tokens in open orders hidden until fill/cancel |
| **Mainnet** | Chain switch |

**Swap vs Markets:** book trades → **Markets**, not Swap.

## Market creation

**Markets** → **Open new market**; Auto/Manual tokens; RAM shown. Dropdown = wallet tokens only.

## Definitions

- **Mainnet** — live protocol.
- **Market order** — execute now; price not guaranteed.
- **Slippage** — fill vs expected; worse thin/volatile books.

## Fees (docs summary)

| Mode | Notes |
|------|--------|
| **Swap (AMM)** | ~**0.3%** → LPs |
| **Market** | ~**0.2%** four WAX pairs (WAX/TLM, Aether, Void, PGL) → dev fund |
| **OTC** | **0.25%**/side when size enough; tiny may be free |

## Community

- [t.me/alcorexchange](https://t.me/alcorexchange)
- [@alcorexchange](https://twitter.com/alcorexchange)
- [discord.gg/kAYNMAKU](https://discord.gg/kAYNMAKU)

## This repo (XPR)

- Prefer **`https://alcor.exchange/v/<slug>/...`** ([alcor-widgets-ecosystem.md](alcor-widgets-ecosystem.md)); here **`https://alcor.exchange/v/xpr/...`** — swap, [`swap-widget`](https://alcor.exchange/v/xpr/swap-widget), farms, bridge, [`.../analytics/tokens/easy-mon3y`](https://alcor.exchange/v/xpr/analytics/tokens/easy-mon3y). **`proton`** = API **`fetch`** host ([alcor-api-realtime.md](alcor-api-realtime.md)).
- **`fetch`/Socket:** **`proton.alcor.exchange`** — not bare **`alcor.exchange/api`** (**301** → WAX).
- Sign **`swap.alcor`** / **`alcor`** memos via WebAuth/Anchor—not **`alcordexmain`** on XPR.
- Re-verify on **[explorer.xprnetwork.org](https://explorer.xprnetwork.org/)**.
