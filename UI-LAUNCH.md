# Flex Forex launch UI — spec for a fresh frontend project

This file is everything a **new UI repo** needs to ship a launch wizard against the **flexforex** contract and **Alcor Swap** on XPR Network. Pool create / deposit / range / lock are **Alcor actions signed by the issuer**. flexforex only **registers** the intent and **stamps** once the on-chain lock is real. After stamp, transfers no longer read Alcor.

Suggested stack: Vite + TypeScript, [WharfKit](https://wharfkit.com/) (or WebAuth), `@alcorexchange/alcor-swap-sdk` for ticks and `sqrtPriceX64`.

---

## 1. Network and accounts

| Item | Value |
|------|--------|
| Chain | XPR Network (Proton) |
| Chain ID | `384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f3a223` |
| API (example) | `https://xprnetwork.org` or another listed endpoint |
| Explorer | `https://explorer.xprnetwork.org` |
| Alcor UI | `https://alcor.exchange/v/xpr/` |
| Alcor API | `https://proton.alcor.exchange/api/v2` |

| Contract | Account | Role |
|----------|---------|------|
| Flex token | **`flex.mon3y`** (deployed account; override via `VITE_FLEXFOREX_CONTRACT`) | Forge, mint, `reglaunch`, `stamp`, transfers, reflect |
| Alcor AMM | `swap.alcor` | `createpool`, `addliquid`, `lockpos`, `collect`, tables |
| Alcor order book | `alcor` | Not used for this launch path |
| EASY | `mon3y` | Flex quote |
| WON | `w3won` | Flex quote |
| MEME | `m3m3` | Flex quote |
| GRAMS | `gold.mon3y` | Flex quote (confirm symbol `GRAMS` on explorer before shipping) |
| Wrapped tokens | `xtokens` | Alternate quote if TVL proof passes |
| XPR | `eosio.token` | Proof quote for xtoken eligibility (`XPR`, precision 4) |
| XUSDC | `xtokens` | Proof quote (`XUSDC`, typically precision 6) |

Wallet: [WebAuth](https://webauth.com/getStarted). The **issuer** (the account that pays **contract RAM**, `forge`, and Alcor RAM) must sign every launch step.

**Contract RAM (required, UI-enforced):** before `forge`, the issuer buys **5,000.0000 XPR** of RAM **for the flexforex contract** (`eosio::buyram`, `receiver` = flexforex). That gift pays for the new `stat` / `launches` / holder tables. Show the issuer’s XPR balance and disable Forge until this tx succeeds for the current draft. This is not the same as Alcor pool RAM (paid later on `createpool`).

---

## 2. Product rules the UI must enforce

The **contract** only checks Alcor math (fee tier, tick spacing, ±443636, one-sided range, 100% supply, 90-day lock). Pretty price caps live in the **UI**:

| Quote | Suggested starting price | Suggested max (upper tick) |
|-------|--------------------------|----------------------------|
| EASY @ `mon3y` | 0.000001–1,000,000 EASY per launched token | 1,000,000 EASY / token |
| WON @ `w3won` | 1 unit of WON / token | 10,000 WON / token |
| GRAMS @ `gold.mon3y` | 1 unit of GRAMS / token | 1,000 GRAMS / token |
| MEME @ `m3m3` | 1 unit of MEME / token | 100,000,000,000 MEME / token |
| Any `xtokens` asset | Whatever the SDK allows | Whatever the SDK allows |

Also in the UI (not all on-chain):

- **Buy 5,000 XPR of RAM for flexforex** (`eosio::buyram`) before `forge` — see §4 Step 0.
- Always a **one-sided** range: deposit **only** the new flex token; quote desired amount is `0`.
- **Lock at least 90 days** (`unlockTime >= now + 7776000`).
- Mint **100% of `maximum_supply`** to the issuer, then deposit **all of it** into the position (no leftover Alcor “balances” row).
- Fee tier: `500` (0.05%, spacing 10), `3000` (0.3%, spacing 60), or `10000` (1%, spacing 200).

After a successful **stamp**:

- Flex-quote launches: **0%** protocol skim.
- xtoken-quote launches: **0.25%** of the reflection pool to `nyra` and **0.25%** to `reflections` on each `reflect()`.
- Those rates **do not change** if the issuer later removes liquidity.

Until stamp, the token **cannot transfer** except **to `swap.alcor`**. Show this in the wizard so users do not try to send to a friend first.

---

## 3. Tables the UI must read

### flexforex

| Table | Code | Scope | Key | Why |
|-------|------|-------|-----|-----|
| `stat` | flexforex | symbol code (raw) | symbol | `supply`, `max_supply`, `issuer`, fee pools |
| `settings` | flexforex | flexforex | symbol | fees, pagination, Numbers/Luck |
| `launches` | flexforex | flexforex | symbol | `quote`, ticks, `sqrt_price_x64`, `launched`, `pool_id`, `pos_id`, `nyra_bps`, `refl_bps`, `flex_quote` |
| `accounts` | flexforex | owner | symbol | balances (issuer, `swap.alcor`, holders) |
| `flexers` | flexforex | symbol | owner | holder rows after activation |
| `flexpools` | flexforex | symbol | id | optional reflection swap routes |

`launches.launched === false` (or missing row) → wizard still in progress.  
`launched === true` → token is live; do not re-run Alcor seed.

### swap.alcor

| Table | Scope | Why |
|-------|-------|-----|
| `system` | `swap.alcor` | `activeFee` (extended_asset). If amount &gt; 0, pool starts inactive until paid |
| `pools` | `swap.alcor` | `id`, `active`, `tokenA`, `tokenB`, `fee`, `tickSpacing`, `currSlot.tick`, `currSlot.sqrtPriceX64`, `liquidity` |
| `positions` | **pool id** | issuer’s range; `id` is `pos_id` for locks |
| `locks` | `swap.alcor` | `pos_id` → `unlockTime` (unix seconds). Missing row = not locked |
| `balances` | **owner** | unused deposits (must be 0 for the launched token at stamp) |

Find a new pool after `createpool`: listen for inline action `logpool` (`poolId`, tokens, `fee`) or scan `pools` for the sorted `(tokenA, tokenB, fee)` triple. **Do not** assume `createpool` returns the id in the same action’s traces without reading `logpool`.

---

## 4. Wizard steps (exact order)

Use a stepper. Persist `token_symbol`, precision, `maximum_supply`, quote, ticks, `sqrtPriceX64`, `poolId`, and **RAM purchase** in local state. The issuer signs with WebAuth.

### Step 0 — Buy 5,000 XPR of RAM for the contract

**Contract:** `eosio`  
**Action:** `buyram`  
**Auth:** `issuer@active` (issuer pays; RAM is credited to **flexforex**)

```json
{
  "payer": "alice",
  "receiver": "flexforex",
  "quant": "5000.0000 XPR"
}
```

`quant` is always **`5000.0000 XPR`** (`eosio.token`, precision 4). Do **not** use `buyrambytes` for this step — the product rule is a **5,000 XPR** gift, not a byte target.

UI must:

1. Read the issuer’s XPR balance (`get_currency_balance` on `eosio.token`). Disable the button if balance &lt; 5,000 XPR.
2. Read flexforex `get_account` (`ram_quota` / `ram_usage`) so the issuer can see contract headroom before and after.
3. Block **Forge** (and later steps) until this draft has a successful `buyram` (store the tx id next to `token_symbol`).
4. Explain that RAM stays on the **contract** account (it is not refunded to the issuer) and that Alcor pool RAM is a **later**, separate cost on `createpool`.

If `VITE_FLEXFOREX_CONTRACT` is not a live account yet, show that error from the chain and do not skip the step.

### Step A — Forge

**Contract:** flexforex  
**Action:** `forge`  
**Auth:** `issuer@active` (issuer pays RAM)

```json
{
  "issuer": "alice",
  "maximum_supply": "1000000.0000 FOO"
}
```

`maximum_supply` carries **symbol + precision + amount**. Precision is fixed forever. Reject empty issuer, invalid names, and symbols that already exist (`stat` row present).

### Step B — Mint 100%

**Action:** `mint`  
**Auth:** issuer  

```json
{
  "to": "alice",
  "quantity": "1000000.0000 FOO",
  "memo": "initial supply"
}
```

`to` **must** be the issuer. Quantity must equal remaining `max_supply - supply` (usually the full cap in one mint). After this, `accounts` scope=`alice` holds 100%.

### Step C — Register launch (flexforex, before Alcor RAM)

**Action:** `reglaunch`  
**Auth:** issuer  

```json
{
  "token_symbol": "FOO",
  "quote": {
    "quantity": "0.000000 EASY",
    "contract": "mon3y"
  },
  "fee": 3000,
  "tick_lower": -120,
  "tick_upper": 222000,
  "sqrt_price_x64": "18446744073709551616",
  "proof_pool_id": 0
}
```

- `token_symbol` is the **code only** (`FOO`), same string style as `reflect`.
- `quote.quantity` amount **must be 0**; symbol + precision must match the live quote token.
- Flex quotes: `proof_pool_id` = **0**.
- xtokens: `quote.contract` = `xtokens`, `proof_pool_id` = an **existing** `swap.alcor` pool that pairs that xtoken with **XUSDC@xtokens** or **XPR@eosio.token**, and Alcor inventory of that xtoken must be worth **≥ 10 XUSDC or ≥ 1000 XPR**. Query `pools` + `xtokens` `accounts` (scope `swap.alcor`) before enabling the Continue button; the contract will reject otherwise.
- `fee` ∈ `{500, 3000, 10000}`.
- Ticks must be multiples of spacing (10 / 60 / 200), `tick_lower < tick_upper`, inside `[-443636, 443636]`.
- `sqrt_price_x64` is `uint128` as a **decimal string** in JSON. Compute with the Alcor SDK from the **initial** price (see §5). `1:1` raw is `2^64` = `18446744073709551616`.

Can be called again until **stamp** succeeds (updates the `launches` row).

### Step D — Create the Alcor pool

**Contract:** `swap.alcor`  
**Action:** `createpool`  
**Auth:** issuer  

Sort tokens **before** the call (Alcor will reject unsorted pairs):

1. Lower `contract` name value first.
2. If contracts are equal, lower **symbol code** first.

Pass **zero-amount** `extended_asset`s:

```json
{
  "account": "alice",
  "tokenA": { "quantity": "0.0000 FOO", "contract": "flexforex" },
  "tokenB": { "quantity": "0.000000 EASY", "contract": "mon3y" },
  "sqrtPriceX64": "18446744073709551616",
  "fee": 3000
}
```

Use the **same** `sqrtPriceX64` and `fee` as `reglaunch`. `account` is the issuer (they pay RAM).

Then read `poolId` from `logpool` or `pools`.

### Step E — Activate pool (only if needed)

Read `swap.alcor` / `system` / id `0` → `activeFee`.

If `activeFee.quantity.amount > 0` and the new pool has `active == false`, transfer **exactly** that asset to `swap.alcor` with memo:

```
activepool#<poolId>
```

Example: `50000.0000 XPR` from `eosio.token` (amount is whatever `activeFee` says — do not hardcode).

If `activeFee` is zero, skip.

### Step F — Deposit 100% of the flex token

**Contract:** flexforex  
**Action:** `transfer`  
**Auth:** issuer  

```json
{
  "from": "alice",
  "to": "swap.alcor",
  "quantity": "1000000.0000 FOO",
  "memo": "deposit"
}
```

Memo **must** be `deposit` (Alcor credits the issuer’s unused balance). Before stamp this is the **only** allowed destination. Amount = full `stat.supply` (and issuer wallet balance).

Do **not** deposit the quote token (one-sided).

### Step G — Add one-sided liquidity

**Contract:** `swap.alcor`  
**Action:** `addliquid`  
**Auth:** issuer  

Decide which side is the new token after sorting:

- If launched token is **tokenA**: `tokenADesired` = full supply, `tokenBDesired` = `0` of quote symbol. Current tick must be **&lt; tickLower** (price below the range → 100% tokenA). Set initial `sqrtPriceX64` so `currSlot.tick < tickLower`.
- If launched token is **tokenB**: `tokenBDesired` = full supply, `tokenADesired` = `0`. Current tick must be **≥ tickUpper**.

```json
{
  "poolId": 1234,
  "owner": "alice",
  "tokenADesired": "1000000.0000 FOO",
  "tokenBDesired": "0.000000 EASY",
  "tickLower": -120,
  "tickUpper": 222000,
  "tokenAMin": "0.0000 FOO",
  "tokenBMin": "0.000000 EASY",
  "deadline": 0
}
```

`owner` **must** be the issuer. Ticks **must** match `reglaunch`. `deadline` `0` = no deadline.

After success: issuer `accounts` on flexforex for this symbol should be `0`; `swap.alcor` holds 100%; issuer Alcor `balances` for this token should be `0`.

### Step H — Lock ≥ 90 days

**Contract:** `swap.alcor`  
**Action:** `lockpos`  
**Auth:** issuer  

```json
{
  "poolId": 1234,
  "owner": "alice",
  "tickLower": -120,
  "tickUpper": 222000,
  "unlockTime": 1740000000
}
```

`unlockTime` = unix seconds, **≥ now + 90 days**. Alcor can only **extend** a lock later, never shorten it. While locked, `subliquid` / `transferpos` fail; **`collect` still works**.

Read `locks` by `pos_id` (from `positions.id`) to show the countdown.

### Step I — Stamp (unlocks the token)

**Contract:** flexforex  
**Action:** `stamp`  
**Auth:** issuer  

```json
{
  "token_symbol": "FOO",
  "pool_id": 1234,
  "tick_lower": -120,
  "tick_upper": 222000
}
```

This is the **only** expensive Alcor check. It requires:

- Pool active, fee + pair match `reglaunch`
- One-sided vs current tick
- Issuer position with liquidity
- Lock remaining ≥ 90 days
- `get_supply` == flexforex balance of `swap.alcor`
- Issuer unused Alcor balance of the token == 0

On success: `launches.launched = true`. Transfers to anyone now work (normal flex tax). `reflect` is allowed.

**Do not** put `createpool` and `stamp` in the same transaction as `createpool` — the new `poolId` is not readable until that action finishes. Typical split: tx1 createpool → read id → tx2 activate+deposit+addliquid+lockpos → tx3 stamp (or combine 2+3 after id is known). `addliquid`+`lockpos` can share a tx once `poolId` exists.

---

## 5. Off-chain math (SDK)

Use `@alcorexchange/alcor-swap-sdk` (same formulas as Uniswap v3 / Alcor):

- `tickSpacing` from fee: 500→10, 3000→60, 10000→200.
- Snap user prices to valid ticks: `nearestUsableTick`.
- `sqrtPriceX64` for the **starting** price: `sqrt(tokenB/tokenA) * 2^64` in **raw** amounts (not human units). Account for decimal difference:  
  `priceRaw = humanPrice * 10^(decB - decA)` where `humanPrice` is tokenB per tokenA.
- One-sided: pick a start price **outside** the range as in Step G, then set `sqrtPriceX64` from that start tick/price.

Show a preview: “Buyers pay between X and Y QUOTE per TOKEN as they walk the range.”

---

## 6. Preflight checklist (enable Stamp only if all pass)

Read-only; mirrors the contract:

1. `launches` row exists, `launched == false`.
2. `pools[poolId].active == true`.
3. Pool tokens + fee match launch row.
4. `positions` (scope poolId) has issuer + same ticks, `liquidity > 0`.
5. `locks[posId].unlockTime >= now + 90d`.
6. flexforex `accounts` scope `swap.alcor` == `stat.supply`.
7. Issuer flexforex balance == 0 (or negligible).
8. Alcor `balances` scope issuer: no leftover launched token (or amount 0).
9. `currSlot.tick` is below `tickLower` if we are tokenA, else `>= tickUpper`.

Surface the contract’s error strings verbatim when a tx fails (users search them).

---

## 7. After launch (same UI or token dashboard)

These are flexforex actions; they do **not** need Alcor until the user wants LP fees.

| Action | When | Notes |
|--------|------|--------|
| `transfer` | Anytime after stamp | Normal tax from `settings` |
| `setconfig` | Contract account today | Default 1% reflection + 1% project; product may keep this admin-only |
| `setdist` | Issuer/admin, **once** | Numbers / Luck split |
| `reflect` | Anyone after stamp | Skims stamped protocol bps first, then 61.8% splash |
| `addpool` / `interestoken` | Optional | Route reflections through Alcor memos |
| `inheritance` / `inheritmemo` | Holders | |
| `renounce` | Opt out of reflections | One-way for self |
| `swap.alcor::collect` | Issuer | Harvest trading fees while locked; `tokenAMax`/`tokenBMax` = position `feesA`/`feesB` |

Do not build `transferpos` into the launch flow. Positions stay with the issuer.

---

## 8. WharfKit sketch

```ts
import { Session } from '@wharfkit/session';

const FLEX = 'flexforex'; // deployed account
const SWAP = 'swap.alcor';

await session.transact({
  action: {
    account: FLEX,
    name: 'reglaunch',
    authorization: [{ actor: session.actor, permission: 'active' }],
    data: {
      token_symbol: 'FOO',
      quote: { quantity: '0.000000 EASY', contract: 'mon3y' },
      fee: 3000,
      tick_lower: -120,
      tick_upper: 222000,
      sqrt_price_x64: '18446744073709551616',
      proof_pool_id: 0,
    },
  },
});
```

Load ABIs from the chain (`get_abi`) for `flexforex` and `swap.alcor`. `sqrt_price_x64` / `sqrtPriceX64` serialize as uint128.

Table reads: `get_table_rows` with `json: true`. For `stat` / `accounts`, `scope` is the **symbol code as a name-ish scope** — on Antelope this is `symbol_code.raw()` (the uint64 of the code, often passed as the symbol string depending on the API). Match however your stack already reads eosio.token `stat` (same pattern).

---

## 9. Suggested screens

1. **Connect wallet** (WebAuth) + show XPR balance (need **≥ 5,000 XPR** for contract RAM, plus extra for Alcor / possible `activeFee`).
2. **Create token** — image, display name, ticker, precision, max supply, preview (Clanker-style deploy form).
3. **Contract RAM** — one-shot `buyram` of **5,000.0000 XPR** to flexforex; show contract `ram_quota` / `ram_usage`; required before Forge.
4. **Pick quote** — EASY / WON / GRAMS / MEME / xtoken picker (xtoken: user pastes or selects a proof pool; UI verifies TVL).
5. **Range** — chart or two prices; snap ticks; show one-sided warning; lock duration (min 90 days).
6. **Review** — RAM paid, sorted tokenA/B, fee, start price, 100% deposit, lock date.
7. **Execute** — buttons per tx with status (RAM, forged, minted, registered, pool id, active, deposited, ranged, locked, stamped).
8. **Done** — Alcor swap deep link `https://alcor.exchange/v/xpr/swap?input=QUOTE-contract&output=FOO-flexforex`, explorer links, `launched` badge.

Same app, other routes (not the wizard):

- **Leaderboard** — stamped `launches` plus `flexers` ranked by balance.
- **Historic reflections** — Hyperion `flexforex:reflect` (and related) history.
- **Portfolio** — connected account’s flex balances, `flexers` row, and reflections still due (`reflect` / reward-token setup).

---

## 10. Errors to handle in copy

| Message (substring) | User-facing hint |
|---------------------|------------------|
| `overdrawn balance` / `insufficient` | Need **≥ 5,000 XPR** for contract RAM, plus extra for Alcor. |
| `unknown key` / `unable to retrieve account` | `VITE_FLEXFOREX_CONTRACT` is not a live account. |
| `Place a one-sided Alcor range` | Token not stamped; finish lock + stamp. Cannot send except to `swap.alcor`. |
| `reglaunch first` | Run register before stamp. |
| `already stamped` | Launch finished. |
| `proof pool` / `10 XUSDC` / `1000 XPR` | Pick a deeper xtoken market. |
| `pool is not active` | Pay `activeFee` with `activepool#id`. |
| `ticks must match` | Same ticks as register / addliquid / lockpos. |
| `100% of supply must sit on swap.alcor` | Deposit the full mint; no leftover in the wallet. |
| `unused Alcor balance must be 0` | `addliquid` did not consume the deposit. |
| `lock ≥ 90 days` | Increase `unlockTime`. |
| `one-sided launch` | Start price is inside the range or on the wrong side of tokenA/tokenB. |
| `fee must be 500, 3000, or 10000` | Invalid fee tier. |

---

## 11. Out of scope for the launch UI

- Deploying contracts, `eosio.code`, or setting flexforex permissions.
- flexlaunch as a separate contract (removed; all flags live in `launches` on flexforex).
- Calling `addliquid` / `lockpos` **as** flexforex — the issuer owns the position.

When the deployed flexforex account name is not `flexforex`, put it in env (`VITE_FLEXFOREX_CONTRACT`) and keep this document’s action/table names unchanged.
