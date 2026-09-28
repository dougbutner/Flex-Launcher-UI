---
name: flex-project-contracts
description: >-
  Complete source of truth for this repo’s live flex token contracts in
  src/Project Contracts (easyflex, complexflex, flexforex): every action, table,
  tax/payout path, launch law, Alcor wiring, angel numbers, jackpot, inheritance,
  and UI coverage gaps. Use when building or reviewing Flex Launcher UI, RPC
  reads, signing payloads, reflections/portfolio, or any easyflex / complexflex /
  flexforex / flex.mon3y / mon3y / gold.mon3y work. Prefer these files and AGENTS.md
  over UI-LAUNCH.md.
---

# Flex project contracts

Canonical C++: **`src/Project Contracts/`** (`*.hpp` / `*.cpp`). If header and cpp disagree, **cpp wins**. Never invent ABI fields. Never emit stale names.

## Instructions

1. Read this file first for product split + UI gap.
2. Open **[tables-and-actions.md](tables-and-actions.md)** before any `get_table_rows` or signed action.
3. For flexforex-only (angel / jackpot / setdist / ratios / setangelnum / inheritance): **[flexforex-extras.md](flexforex-extras.md)**.
4. For tax / skim / makeitrain / underlying swap math: **[economics.md](economics.md)**.
5. Product screens / env / wizard order: **[AGENTS.md](../../../AGENTS.md)** + `.cursor/rules/flex-launcher-ui.mdc`.
6. Alcor AMM memos/URLs: `.agents/skills/alcor-exchange`. Wallets: `.agents/skills/web-sdk`, `src/services/walletConstants.ts`.

`token_symbol` action args are the **symbol code string** (`FOO`), not `"4,FOO"`. Identity is always **(contract, symbol)**.

## Three products

| | easyflex | complexflex | flexforex |
|---|---|---|---|
| Typical account | `3asy` | `fl3x` | `for3x` |
| Supply | `issue` | `mint` | `mint` |
| Payout | `makeitrain(..., sender)` | `makeitrain(..., sender)` | `makeitrain(..., keeper)` |
| Project tax | no | yes | yes |
| Inheritance | no | yes | yes |
| Angel / jackpot / `rng` | no | no | yes |
| Create rates | 0 until issuer `setfees` | 0 until issuer `setfees` | 0 until issuer `setfees` |
| Liftoff EASY@`mon3y` | 5,000 × (prior+1) | 10,000 × (prior+1) | 50,000 × (prior+1) |

Shared launch law: `create` → `setfees` → mint/issue 100% to issuer → `startlaunch` → issuer seeds `swap.alcor` → optional `setpresale` after lockpos → `liftoff` (± `golive` if Insiders club). Constants: `PROTO_BPS_HALF=25`, `PAY_NUM/PAY_DEN=382/1000`, `MIN_LOCK_SECS=7776000`, ticks ±443636.

## UI coverage (honest)

**In the Vite app today**

- Launch wizard: two-field `create` / Flexonomics `setfees` / mint|issue / startlaunch (`swap_underlying_default` default true) / Alcor seed / lockpos / Insiders tab (`setpresale` + optional `addinsiders` after lock) / liftoff / `addpool` of the launch quote pair; for3x may sign `ratios` with setfees
- Insiders club: issuer `setpresale` after lockpos and before liftoff; holders `reginsider` / `provelock`; issuer `addinsiders` / `rminsider` / `golive` on token page; gold chat badge from on-chain `insiders`
- Post-launch poke: `makeitrain`, `checklock`, flexforex `pullangel` / `pulljackpot` (+ pot chips)
- Token manage (`/token/:contract/:symbol`): holder `choosereward` / `feeoptout` / `setangelnum` / inheritance; issuer `setfees` / `setdist` / `ratios` / `addpool` / `setmin` (easy + complex)
- Manager (`/manager`): sqlite + chain progress for issuers after first `create`; Save tax (`setfees`) separate from metadata; for3x `ratios`. No IPFS re-upload.
- Read-only: leaderboard holders, reflection history filter, portfolio balances (+ “Your launches”)
- Admin (`/admin`): `token.proton` `reg` / `update` when connected as the flex contract

**Never in UI**

| Feature | Why |
|---------|-----|
| `setconfig` | **contract@active only** |
| `receiverand` | **rng only** |

Issuer tax path: `create` writes 0 rates, then issuer `setfees`. for3x issuers split the reflection slice with `ratios` / `setdist`. Prefer `launchActions.ts`, `flexTables.ts`, Token / Manager patterns.

## Stale names (never emit)

`forge` → `create`. `reglaunch` → `startlaunch`. `stamp` → `liftoff`. `interestoken` / `setflextoken` / `setflexpool` / `sprouttoken` → `addpool` / `choosereward`. `renounce` / `noflexzone` → `feeoptout`. `setratios` → `ratios`. `setnumber` / `pullnumber` → `setangelnum` / `pullangel`. `distribute` / `reflect` → `makeitrain`. Launch: `xtoken_proof_pool_id`, `pure_liquid_alcor_pool_id`, `position_id`, `dev_bps`, `club_bps`, `unlock_time`, `swap_underlying_default`  -  not `proof_pool_id` / `nyra_bps`.

## Accounts / quotes

Env: `VITE_FLEXFOREX_CONTRACT` (`for3x`), `VITE_EASYFLEX` (`3asy`), `VITE_COMPLEXFLEX` (`fl3x`), `VITE_SWAP_ALCOR`. Liftoff EASY always reads **`mon3y`** (C++ `MON3Y`), not `VITE_EASYFLEX`.

Flex quotes (0% skim, proof id 0): EASY@mon3y, WON@w3won, MEME@m3m3, GRAMS@gold.mon3y, GEASY@fl3x.  
The launcher hides GEASY on for3x. Non-flex (0.5% skim, 1% after the LP unlock, proof id **> 0** vs XUSDC or XPR): xtokens, XPR@eosio.token, XMD@xmd.token, LOAN@loan.token.  
Flex quotes except GEASY stay at 90% off the EASY hold. A verified first GEASY launch waives the hold. Other quotes use the monthly promo. Swap memo market is `flex.for3x` (1% not sold). UI says dev and Contributor's Club, never the dev account name.

## Do not

- Edit the three token `.cpp`/`.hpp` unless the user asks.
- Call `setconfig` or `receiverand` from issuer/holder UI. Overall tax is issuer `setfees` after create. for3x issuers use `ratios` / `setdist`.
- Treat `angel_numbers_pool` / `jackpot_pool` as unused pads  -  they are live pots.
- Follow `UI-LAUNCH.md` action names.
