# Flex launcher UI — agent brief

This **Vite app** launches and uses **easyflex**, **complexflex**, and **flexforex**. Contract source of truth: `src/Project Contracts/` (`easyflex.hpp/.cpp`, `complexflex.hpp/.cpp`, `flexforex.hpp/.cpp`). Cursor skill: `flex-project-contracts`. Rule: `.cursor/rules/flex-launcher-ui.mdc`.

**Do not follow `UI-LAUNCH.md` action names.** That file is stale (`forge`, `reglaunch`, `stamp`, `interestoken`, `nyra_bps`/`refl_bps`, `settings` scoped to the contract). Use this file.

Do not edit the three token contracts unless the user asks. Token identity is always **(contract, symbol)** — never ticker alone.

App UI and wallets: `src/` and `src/services/walletConstants.ts`.

---

## Stack and env

Vite + TypeScript, WharfKit / WebAuth (`@proton/web-sdk`). Ticks / `sqrtPriceX64` in `src/services/tickMath.ts` (Alcor SDK optional).

```
PINATA_JWT=
PINATA_GATEWAY=gateway.pinata.cloud
VITE_FLEXFOREX_CONTRACT=flex.mon3y
VITE_EASYFLEX=mon3y
VITE_COMPLEXFLEX=gold.mon3y
VITE_SWAP_ALCOR=swap.alcor
```

| Network | chain id | RPC example | flexforex | easyflex | complexflex |
|---------|----------|-------------|-----------|----------|-------------|
| XPR mainnet | `384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f3a223` | `https://proton.eosusa.io` | `flex.mon3y` | `mon3y` | `gold.mon3y` |
| XPR testnet | `71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd` | `https://proton-testnet.cryptolions.io` | `flexforex` | `easyflex` | `complexflex` |
| Wire Alcor testnet | `cf4381bcea94e79b2cbb630ca1edd59108b1d159637b2cee7c51d45cdca9c0a7` | `https://wiretest-api.alcor.exchange` | `gudsol.ksxla` | `gudsol.rxkks` | `gudsol.chlru` |

Load ABIs with `get_abi` / `get_raw_abi`. `sqrt_price_x64` is `uint128` (decimal string in JSON).

---

## Product split (one wizard, three targets)

Let the user pick **easyflex | complexflex | flexforex** before create. Shared launch path; hide features the ABI does not have.

| | easyflex | complexflex | flexforex |
|---|---|---|---|
| Supply action | `issue` | `mint` | `mint` |
| Payout action | `makeitrain(token_symbol, sender)` | `makeitrain(token_symbol, sender)` | `makeitrain(token_symbol, keeper)` |
| Project tax | no | yes | yes |
| Inheritance / inheritmemo | no | yes | yes |
| `setdist` / `ratios` / `setangelnum` / `pullangel` | no | no | yes |
| `receiverand` | never in UI | never in UI | never in UI (`rng` only) |
| Default create fees | refl 100, burn 100 | refl 100, project 100 | refl 100, project 100 |
| Liftoff EASY@mon3y | 5,000 × (prior + 1) | 10,000 × (prior + 1) | 50,000 × (prior + 1) |
| Alcor accounts excluded from reflect denom | `alcor`, `mon3y`, `swap.alcor` | `alcor`, `gold.mon3y`, `swap.alcor` | `alcor`, `gold.mon3y`, `swap.alcor` |

`setconfig` = **contract@active only** on all three. Do not put tax sliders on the issuer wizard as if they will work.

---

## Tables (`get_table_rows`, `json: true`)

Code = chosen token contract. Scope for `stat` / `settings` / `flexers` / `flexpools` = **symbol code**. Scope for `launches` = **contract account**. Scope for `accounts` = **owner**.

### `launches` (contract scope)

`token_symbol`, `quote` (extended_asset), `fee`, `tick_lower`, `tick_upper`, `sqrt_price_x64`, `xtoken_proof_pool_id`, `flex_quote`, `launched`, `pure_liquid_alcor_pool_id`, `position_id`, `dev_bps`, `club_bps`, `unlock_time`.

- Missing or `launched == false` → wizard in progress.
- `launched == true` → do not re-seed Alcor; show dashboard.
- `unlock_time` is copied from Alcor at liftoff. After it, `checklock` or `makeitrain` may add another `PROTO_BPS_HALF` to `dev_bps` and `club_bps`.

Protocol skim: at liftoff `dev_bps`/`club_bps` = `0` if `flex_quote`, else `25` (0.25% each to `nyra` / `reflections`). May rise once if the LP unlocks.

Liftoff also requires issuer EASY@`mon3y` (contract constant `MON3Y`, not `VITE_EASYFLEX`). Base whole tokens: 5000 / 10000 / 50000. Count this issuer’s already-`launched` tokens on *this* contract; need `base * (count + 1)`.

### `settings`

All: `token_symbol`, `start_key`, `limit`, `reflection_rate`, `burn_rate`, `admin_account`.  
complexflex + flexforex: `project_rate`, `project_account`.  
flexforex only: `dist_locked`, `angel_numbers_bps`, `jackpot_bps`, `jackpot_winners`, `jackpot_min_hold`, `angel_numbers_cooldown`, `keeper_min`, `reflect_min`, `rng_kind`, `rng_amt`.

Rates are **bps / 10000**. `reflect_min` / `keeper_min` / `jackpot_min_hold` are **raw int64**. `reflect_min == 0` → treat as 1 whole token (`10^precision`).

### `flexers`

`owner`, `balance`, `fee_opted_out`, `flex_reward_pool_id` (`0` = native).  
complexflex + flexforex: `beneficiary`, `bene_rate`, `custom_memo`.  
flexforex: `angel_number` (`1000` = unset; valid pick `0–999`). Secondary index `byangel`.

### `flexpools`

PK = Alcor `pool_id`. Fields: `id`, `input_symbol`, `input_contract`, `output_symbol`, `output_contract`.

### `stat`

easyflex: `supply`, `max_supply`, `issuer`, `reflection_pool`, `burn_pool`.  
complexflex: + `project_pool`.  
flexforex: + `angel_numbers_pool`, `jackpot_pool` (live pots — `pullangel` / `pulljackpot`), `angel_numbers_last`, `flexer_count`.

### `swap.alcor`

`system` (activeFee), `pools`, `positions` (scope = pool id), `locks` (by pos id → `unlockTime`), `balances` (unused deposits). New pool id: `logpool` inline.

---

## Launch wizard (issuer@active every step)

Pretty price caps are **UI-only**. Contract checks fee, tick spacing, ±443636, one-sided vs current tick, 100% supply on `swap.alcor`, unused Alcor balance 0, lock remaining ≥ `90 * 86400`.

Suggested quote caps (not on-chain): EASY 1e6 / token, WON 1e4, GRAMS 1e3, MEME 1e11, xtokens unbounded.

Issuer pays **5,000.0000 XPR** RAM to the **token contract** (`eosio::buyram`) before `create`. That is not Alcor pool RAM.

### A — `create`

```json
{ "issuer": "alice", "maximum_supply": "1000000.0000 FOO" }
```

### B — mint / issue 100% to issuer

easyflex: `issue`. Others: `mint`. `to` **must** be issuer.

### C — `startlaunch` (not `reglaunch`)

```json
{
  "token_symbol": "FOO",
  "quote": { "quantity": "0.000000 EASY", "contract": "mon3y" },
  "fee": 3000,
  "tick_lower": -120,
  "tick_upper": 222000,
  "sqrt_price_x64": "18446744073709551616",
  "xtoken_proof_pool_id": 0
}
```

- `token_symbol` = **code string only**. Quote amount **0**.
- Flex quotes: `(mon3y, EASY)`, `(w3won, WON)`, `(m3m3, MEME)`, `(gold.mon3y, GRAMS)` → `xtoken_proof_pool_id = 0`.
- Else `quote.contract = xtokens` and proof pool vs XUSDC or XPR; inventory ≥ 10 XUSDC or 1000 XPR.
- `fee` ∈ {500→10, 3000→60, 10000→200}. Repeatable until `liftoff`.

### D–H — Alcor (issuer, not the flex contract)

1. `createpool` zero amounts, same `sqrtPriceX64` and `fee`.
2. If inactive, pay `activeFee` memo `activepool#<poolId>`.
3. Flex `transfer` issuer → `swap.alcor`, full supply, memo **`deposit`**.
4. `addliquid` one-sided; ticks match `startlaunch`.
5. `lockpos` `unlockTime >= now + 7776000`.

Split txs. Never `liftoff` in the same tx as `createpool`.

### I — `liftoff` (not `stamp`)

```json
{ "token_symbol": "FOO", "pool_id": 1234, "tick_lower": -120, "tick_upper": 222000 }
```

---

## After launch

| Action | Auth | Notes |
|--------|------|-------|
| `transfer` | from | Tax unless opted out / contract payout / pre-liftoff Alcor seed |
| `addpool` | issuer or contract | Fail copy: `⟁ Only the issuer can add a flex reward token.` |
| `choosereward` | owner (or issuer/admin/contract) | Empty `output_contract` → native |
| `feeoptout` | self: `ban_status` **true** only | Irreversible for self |
| `makeitrain` | signer (`sender` or `keeper`) | Always `require_auth` of that name. flexforex ABI field is `keeper`. Signer pays RAM for new holder rows. Splashes 38.2% of `reflection_pool`. |
| `checklock` | anyone | After `unlock_time`, may raise protocol skim once. |
| `setdist` / `ratios` / `setangelnum` / `pullangel` / `pulljackpot` | see ABI | flexforex only |
| `inheritance` / `inheritmemo` | flexer or contract | not easyflex |

Flex payout memo: `swapexactin#<poolId>#<recipient>#<minAmount> <SYM>@<contract>#0#0`

Wallet→wallet tax is **on top of** `quantity`; Alcor inbound tax is **taken from** `quantity`.

Check strings start with `⟁`. Surface them verbatim.

---

## Screens

1. Connect + **which of the three contracts**.
2. Create: symbol, precision, max supply, logo (Pinata / URL + `token.proton` if signing as token contract).
3. Quote: EASY/WON/GRAMS/MEME or xtoken + proof pool.
4. Range: snap ticks, 90d+ lock.
5. Execute: create → mint/issue → startlaunch → createpool → activate → deposit → addliquid → lockpos → liftoff.
6. Token home, holder (`choosereward`, `feeoptout`), keeper, issuer (`addpool`).

---

## Out of scope

Deploying WASM, `eosio.code`, `receiverand`, editing `src/Project Contracts` unless asked.
