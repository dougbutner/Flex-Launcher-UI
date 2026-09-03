---
name: flex-project-contracts
description: >-
  Source of truth for this repo’s live flex token contracts in src/Project Contracts
  (easyflex, complexflex, flexforex): actions, tables, launch/stamp, taxes, reflections,
  Alcor wiring, and UI mapping. Use when building or changing Flex Launcher UI, launch
  wizards, reflections/portfolio pages, RPC table reads, or any easyflex / complexflex /
  flexforex / flex.mon3y / mon3y / gold.mon3y / GRAMS / EASY work. Prefer these files over
  UI-LAUNCH.md and over stale copies under contracts/.
---

# Flex project contracts (this repo)

## Instructions

1. **Read the C++ first.** Canonical sources: `src/Project Contracts/*.hpp` and `*.cpp`. Do not invent actions or table fields. If the header and cpp disagree, the cpp is runtime truth.
2. **Open [tables-and-actions.md](tables-and-actions.md)** before writing UI that signs, queries, or displays token state.
3. Match existing Vite patterns in `src/services/`, `src/config/launch.ts`, and wallet code. Alcor AMM is `swap.alcor` — use the `alcor-exchange` skill for memos/URLs.
4. `token_symbol` action args are the **symbol code string** (`FOO`), not `"4,FOO"`. Precision lives on the `asset` / `symbol` / `stat` row.
5. Never reorder or change types on tables that already hold rows. Do not add extra ABI fields when signing.

`UI-LAUNCH.md` is a launch-wizard sketch. It is **wrong** on settings table scope (it says contract scope; the contracts use **symbol-code scope**). Trust `src/Project Contracts`.

## Three products, one launch law

All three share the same Alcor launch lock:

`create/forge` → mint/issue **100% to issuer** → `reglaunch` → issuer on `swap.alcor` (`createpool`, deposit, one-sided `addliquid`, `lockpos` ≥ 90 days) → `stamp`.

Until `launches.launched == true`, transfers may only go to `swap.alcor` (plus contract self-pays and a small Alcor-related exemption list). After stamp, transfers no longer read Alcor; protocol skim bps on the launch row are **sticky**.

| Contract class | Typical account (confirm in env / explorer) | Create | Issue | Payout | Ban | Flex-to pool | Flex-to pick |
|----------------|-----------------------------------------------|--------|-------|--------|-----|--------------|--------------|
| `easyflex` | `mon3y` (EASY) | `create` | `issue` | `distribute` | `noflexzone` | `setflexpool` | `setflextoken` |
| `complexflex` | `gold.mon3y` (GRAMS) | `forge` | `mint` | `reflect` (no keeper) | `renounce` | `addpool` | `interestoken` |
| `flexforex` | `flex.mon3y` (`VITE_FLEXFOREX_CONTRACT`) | `forge` | `mint` | `reflect(token, keeper)` | `renounce` | `addpool` | `interestoken` |

**easyflex** = takeiteasy-style: anyone can create; **no** inheritance, project tax, Numbers, or Luck. Default tax **1% reflect + 1% burn** (`reflection_rate`/`burn_rate` = 100 bps of 10000).

**complexflex** = grams-style: anyone can forge; inheritance + project tax; **no** Numbers/Luck/RNG. Default **1% reflect + 1% project**, burn 0.

**flexforex** = full stack: same as complexflex plus Numbers, Luck, `rng`, `setdist` / `setratios`, keeper tip on `reflect`. Default **1% reflect + 1% project**, burn 0.

Rates are **integer bps / 10000** (100 = 1%). Payout sends **61.8%** of the eligible pool (`* 618 / 1000`); remainder stays in `reflection_pool`.

## Accounts the UI already knows

From `src/config/launch.ts` (override with env, never hardcode a second source of truth):

- Flex launcher default: `VITE_FLEXFOREX_CONTRACT` or `flex.mon3y`
- Flex quotes: EASY `@ mon3y`, WON `@ w3won`, MEME `@ m3m3`, GRAMS `@ gold.mon3y`
- xtokens: `xtokens`; XPR `eosio.token` precision 4; XUSDC `xtokens` precision 6
- AMM: `swap.alcor`; explorer `https://explorer.xprnetwork.org`; Alcor UI `https://alcor.exchange/v/xpr`

`reglaunch` treats a quote as **flex_quote** only for those four pairs. Anything else must be `xtokens` plus a **proof pool** vs XUSDC or XPR (see reference).

## Launch wizard (issuer signs every step)

Issuer pays **5,000.0000 XPR** RAM to the **token contract account** (`eosio::buyram`, `receiver` = that contract) **before** create/forge. That is not Alcor pool RAM.

1. `buyram` → 2. `create`/`forge` → 3. `issue`/`mint` 100% → 4. `reglaunch` → 5. Alcor `createpool` (zero amounts, same `sqrtPriceX64`) → 6. pay `activeFee` if pool inactive (`memo` `activepool#id`) → 7. `transfer` 100% to `swap.alcor` memo `deposit` → 8. `addliquid` one-sided (quote desired = 0) → 9. `lockpos` `unlockTime >= now + 7776000` → 10. `stamp` with **same ticks** as `reglaunch`.

`reglaunch` quote is a **zero-amount** `extended_asset`. Fees: `500` (spacing 10), `3000` (60), `10000` (200). Ticks in `±443636` and multiples of spacing. `sqrt_price_x64` computed off-chain.

**Stamp** reads Alcor: pool active, fee match, this contract+symbol on exactly one side, quote matches, current tick **below** range if we are tokenA else **at/above** if tokenB, issuer position liquidity > 0, lock ≥ 90d, **100% supply on `swap.alcor` accounts**, unused Alcor balance 0. Then sets `launched`, `pool_id`, `pos_id`, `nyra_bps`/`refl_bps` = `0` if flex quote else `25` each (0.25%).

Until stamp, do not tell users to transfer to friends.

## Transfers and tax (UI copy)

Fees apply unless sender is the **contract** (payouts) or the holder is **banned**, or **pre-stamp seed** to `swap.alcor`.

Non-Alcor sends: fees **add on top** of `quantity` (sender must hold transfer + tax). Alcor-path sends: fees **come out of** `quantity`. If the sender cannot cover, the contract shrinks the received amount.

**Alcor-path exemption lists** (must match cpp):

- easyflex: `alcor`, `swap.alcor`, `mon3y`
- complexflex / flexforex: `alcor`, `swap.alcor`, `gold.mon3y`

Payout **excludes those same balances** from supply when computing holder shares (easyflex uses `mon3y`; the other two use `gold.mon3y`).

`on_notify *::transfer`: if `to == self` and `from == swap.alcor` and memo starts with `Col`, forward the asset to `reflections` (LP fee collect).

## Reflections UI

- **easyflex:** `distribute(token_symbol)` — anyone; paginates `settings.start_key` / `limit`.
- **complexflex:** `reflect(token_symbol)` — anyone; same pagination; pays inheritance + flextoken swaps.
- **flexforex:** `reflect(token_symbol, keeper)` — if `keeper_min > 0`, **keeper must sign**; tip comes from the standard slice.

xtoken launches skim **0.25%** of the standard slice to `nyra` and **0.25%** to `reflections` on each payout (from `launches.nyra_bps` / `refl_bps`). Flex-quote launches skim 0%.

Holders can route payouts through Alcor via `flexpools` + `flextoken` (swapexactin memo to `swap.alcor`). Empty `output_contract` on interestoken/setflextoken clears the route (`flextoken = 0`).

## flexforex-only (Numbers / Luck)

Do not show these on easyflex/complexflex screens.

- `setconfig` — **contract only** (tax/burn/project). Issuer cannot change tax.
- `setratios` — issuer or contract: `numbers_bps` + `luck_bps` ≤ 10000; remainder of `reflection_pool` is standard.
- `setdist` — issuer **once** (`dist_locked`) or contract anytime: ratios + luck winners, luck min hold (checked **after** RNG pick), numbers cooldown, keeper_min, reflect_min.
- `setnumber` — owner, code **0–999**; `pick == 1000` means unset.
- `pullnumber` — after cooldown; reserves numbers slice, calls `rng`.
- `receiverand` — **only** `rng@active`; assoc_id = symbol code.

All channel money sits in `stat.reflection_pool`. `numbers_pool` / `luck_pool` are **ABI pads — never credit them**.

## RPC scopes (get_table_rows)

| Table | code | scope | PK |
|-------|------|-------|----|
| `stat` | token contract | **symbol code raw** | symbol |
| `settings` | token contract | **symbol code raw** | symbol |
| `flexers` | token contract | **symbol code raw** | owner (`flexforex` also `bynumber`) |
| `flexpools` | token contract | **symbol code raw** | Alcor pool id |
| `accounts` | token contract | **account name** | symbol |
| `launches` | token contract | **contract name** | symbol |

## UI build rules

- One wizard family, three contract adapters: swap action names and `reflect` arity; share tick math and Alcor steps.
- Do not sign `linkauth`. Do not call `setconfig` from issuer UI.
- `token.proton` logos still need `tcontract@active` (the **token contract account**, not the issuer).
- Check strings in cpp often start with `🜚` (flexforex/complexflex) or `❇️` (easyflex) — map them in `src/services/txParse.ts`.
- Includes in cpp (`include/alcorswap_interface.hpp`) may live under `contracts/alcor-exchange/` in this repo. For ABI/behavior, still read `src/Project Contracts`.

## Related

- Alcor AMM / URLs: `.agents/skills/alcor-exchange`
- Wallets: `.agents/skills/web-sdk`, `src/services/walletConstants.ts`
- Generic XPR RPC: `.agents/skills/rpc-queries`
- C++ style if editing contracts: `.cursor/rules/antelope-dev-style.mdc`
