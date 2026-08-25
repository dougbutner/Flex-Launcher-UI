# Alcor — embed widgets, farms, LSW, listings, bridge

Part of the **[Alcor skill split](alcor-exchange.md)**.

## Prefer **`/v/<chain>/...`**

Use **`https://alcor.exchange/v/<slug>/...`** for hyperlinks and iframe `src` when available (**XPR**, **WAX**). Legacy **`https://<chain>.alcor.exchange/...`** only as fallback (broken route, old snippet).

**EOS / Telos:** web UI stays **`eos.alcor.exchange`** / **`telos.alcor.exchange`**—do **not** use **`/v/eos/`** or **`/v/telos/`**.

## XPR (`/v/xpr/`)

Every XPR UI link: **`https://alcor.exchange/v/xpr/<path>`** (not `proton.alcor.exchange/...`, not bare `alcor.exchange/swap`).

| Destination | Example URL |
|-------------|-------------|
| Swap | [https://alcor.exchange/v/xpr/swap](https://alcor.exchange/v/xpr/swap) |
| Swap + tokens | `https://alcor.exchange/v/xpr/swap?input=XUSDC-xtokens&output=EASY-mon3y` |
| Compact swap iframe (widget route) | `https://alcor.exchange/v/xpr/swap-widget` |
| Chart iframe | `https://alcor.exchange/v/xpr/chart-widget?input=<tokenId>&output=<tokenId>` |
| Farms index | [https://alcor.exchange/v/xpr/farm](https://alcor.exchange/v/xpr/farm) |
| Create farm incentive | `https://alcor.exchange/v/xpr/farm/create` |
| Farm filters | `https://alcor.exchange/v/xpr/farm?contracts=<contract>` (comma-separated) |
| Token analytics | `https://alcor.exchange/v/xpr/analytics/tokens/<slug>` — e.g. [EASY / mon3y](https://alcor.exchange/v/xpr/analytics/tokens/easy-mon3y) |
| Bridge | [https://alcor.exchange/v/xpr/bridge](https://alcor.exchange/v/xpr/bridge) |
| Public backups UI | [https://alcor.exchange/v/xpr/backups](https://alcor.exchange/v/xpr/backups) |

Optional **`market=`** etc.—match live UI + [docs.alcor.exchange](https://docs.alcor.exchange/). GitBook may list subdomains; **`/v/xpr/`** is repo standard.

## Embed: Swap iframe (XPR)

```html
<iframe
  src="https://alcor.exchange/v/xpr/swap-widget"
  width="445"
  height="600"
></iframe>
```

**Params:** `input`, `output`, `only`, `market` ([alcor-swap-amm.md](alcor-swap-amm.md)). Token id = `symbol-contract` in UI.

### Chart widget (XPR)

`https://alcor.exchange/v/xpr/chart-widget?output=<tokenId>&input=<tokenId>` — ids from Proton **`GET`** ([alcor-api-realtime.md](alcor-api-realtime.md)), not WAX.

## WAX — prefer **`/v/wax/`**

**`https://alcor.exchange/v/wax/...`** first: [swap](https://alcor.exchange/v/wax/swap), **`/swap-widget`**, [bridge](https://alcor.exchange/v/wax/bridge). Fallback **`https://wax.alcor.exchange/...`** only when needed ([docs.alcor.exchange](https://docs.alcor.exchange/)).

## EOS & Telos — subdomain only

No **`https://alcor.exchange/v/eos/...`** or **`/v/telos/...`**.

| Chain | Compact widget | Typical swap / paths |
|-------|----------------|----------------------|
| EOS | `https://eos.alcor.exchange/swap-widget` | `https://eos.alcor.exchange/swap`, chart `/chart-widget`, farm `/farm`, etc. |
| Telos | `https://telos.alcor.exchange/swap-widget` | `https://telos.alcor.exchange/swap`, same paths on **`telos.alcor.exchange`** |

REST **`https://eos.alcor.exchange/api`**, **`https://telos.alcor.exchange/api`** ([alcor-api-realtime.md](alcor-api-realtime.md)).

## Farms

On-chain incentives; claim/resume anytime. **XPR create:** **`https://alcor.exchange/v/xpr/farm/create`**. **`swap.alcor`** tables: `incentives`, `stakingpos`, `stakes` (scoped by incentive id). **`reward.alcor`** ≠ farm contract ([alcor-exchange.md](alcor-exchange.md)).

## LSW (WAX)

Stake WAX → **LSW** (1:1 start; rewards update rate per docs). Routing via **`liquid.alcor`**. Withdraw: 3-day unbond **or** instant **LSW/WAX** swap.

## Listing tokens

**Metadata:** **[github.com/avral/alcor-ui](https://github.com/avral/alcor-ui)** — `assets/fundamentals/<chain>.json`. Keys **`SYMBOL@contract`** (uppercase): `name`, `website`, `tags`, `socials`, `github`, `description`, …

**Logos:** `assets/tokens/<chain>/<symbol>_<contract>.png` (lowercase, 64×64). Legacy **[eos-airdrops](https://github.com/eoscafe/eos-airdrops)**. **[Telegram](https://t.me/alcorexchange)**.

**USD in UI:** pool to WAX/USDT, **TVL ≥ ~$1** (docs).

## WAX — USDT & bridge

IBC USDT. Bridge: **[https://alcor.exchange/v/wax/bridge](https://alcor.exchange/v/wax/bridge)**. **`ibc.alcor`**, **`usdt.alcor`**. [ibc-docs.uxnetwork.io](https://ibc-docs.uxnetwork.io/).
