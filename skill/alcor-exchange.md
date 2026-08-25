# Alcor Exchange — skill index

Condensed from **[Alcor documentation](https://docs.alcor.exchange/)** (GitBook). Verbatim text: site, **[llms-full.txt](https://docs.alcor.exchange/llms-full.txt)**, **[sitemap](https://docs.alcor.exchange/sitemap.md)**. Docs WIP; not financial advice.

**Upstream ABI / API guide (synced):** [`alcor-dex.md`](alcor-dex.md) from [xpr-network-dev-skill](https://github.com/XPRNetwork/xpr-network-dev-skill). Use that for contracts, memos, and REST; use this index + split files for **`/v/xpr/`** link rules.

## Module map

| Topic | File |
|--------|------|
| Upstream Alcor DEX (order book + v3 AMM) | [`alcor-dex.md`](alcor-dex.md) |
| Product / UI / fees / community / XPR notes | [`alcor-overview-ui.md`](alcor-overview-ui.md) |
| Orderbook / tables / memos / RPC | [`alcor-orderbook.md`](alcor-orderbook.md) |
| AMM `swap.alcor`, memos, CL, TWAP | [`alcor-swap-amm.md`](alcor-swap-amm.md) |
| REST + Socket.IO | [`alcor-api-realtime.md`](alcor-api-realtime.md) |
| Widgets, farms, LSW, listings, bridge | [`alcor-widgets-ecosystem.md`](alcor-widgets-ecosystem.md) |

## URLs — web vs API

### Human (XPR)

**`https://alcor.exchange/v/xpr/<path>`** only—swap, swap-widget, charts, farms, analytics, bridge, backups ([alcor-widgets-ecosystem.md](alcor-widgets-ecosystem.md)). Example: [alcor.exchange/v/xpr/analytics/tokens/easy-mon3y](https://alcor.exchange/v/xpr/analytics/tokens/easy-mon3y).

SPA slug **`xpr`** (not `proton`). Socket/API payload **`chain`** still **`"proton"`**.

### Other chains

Prefer **`https://alcor.exchange/v/<slug>/...`** when it exists ([alcor-widgets-ecosystem.md](alcor-widgets-ecosystem.md)).

| Chain | Links |
|-------|--------|
| **XPR** | **`https://alcor.exchange/v/xpr/...`** |
| **WAX** | Prefer **`https://alcor.exchange/v/wax/...`**; **`wax.alcor.exchange`** fallback |
| **EOS** | **`https://eos.alcor.exchange/...`** only — never **`/v/eos/`** |
| **Telos** | **`https://telos.alcor.exchange/...`** only — never **`/v/telos/`** |

### Programmatic REST + Socket.IO

| Use | Host |
|-----|------|
| JSON REST | `https://proton.alcor.exchange` — e.g. `GET /api/markets`. Bare **`alcor.exchange/api`** → **301** → **WAX** |
| Socket.IO | `wss://proton.alcor.exchange/socket.io/` — `io('https://proton.alcor.exchange')` |

**Proton JSON:** always **`https://proton.alcor.exchange/api/...`** (not **`https://alcor.exchange/api/markets`** → **`wax.alcor.exchange`**).

**Not REST:** **`/v/xpr/api/markets`** hits SPA → redirect. JSON stays **`proton.alcor.exchange/api`**.

## XPR mainnet contracts

Verified **`chain/get_abi`** / **`get_raw_code_and_abi`** vs **`https://rpc.api.mainnet.metalx.com`**—re-check before prod.

| Account | Role | ABI |
|---------|------|-----|
| **`swap.alcor`** | CL AMM + farms (`regmarket`, `createpool`, LP, stake, incentives, TWAP, …) | Full |
| **`alcor`** | Orderbook (`cancelbuy`, `cancelsell`, `buyorder`/`sellorder`, …) | Full |
| **`reward.alcor`** | — | No WASM/ABI—normal account; farms on **`swap.alcor`** |

### `swap.alcor` tables

`balances`, `banlist`, `bitmaps`, `forzenpools` *(typo on-chain)*, `incentivefee`, `incentives`, `markets`, `observations`, `pools`, `positions`, `stakereturn`, `stakes`, `stakingpos`, `system`, `ticks`, `whitelist`.

### `alcor` tables

`account`, `ban`, `buyorder`, `freeorders`, `markets`, `sellorder`, `settings`.

Verify memos/actions on **[explorer.xprnetwork.org](https://explorer.xprnetwork.org/)**.

## Related (non-Alcor)

| DEX | File |
|-----|------|
| Metal X | [`metalx-dex.md`](metalx-dex.md) |
| SimpleDEX | [`simpledex.md`](simpledex.md) |
| DeFi overview | [`defi-trading.md`](defi-trading.md) |

*Updates: [docs.alcor.exchange](https://docs.alcor.exchange/).*
