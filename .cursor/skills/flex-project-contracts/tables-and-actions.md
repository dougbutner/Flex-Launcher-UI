# Tables and actions — `src/Project Contracts`

Source: `easyflex.hpp` / `.cpp`, `complexflex.hpp` / `.cpp`, `flexforex.hpp` / `.cpp`. Constants: `SWAP_ALCOR = swap.alcor`, `XTOKENS = xtokens`, `MIN_LOCK_SECS = 7776000`, `MIN_TICK/MAX_TICK = ±443636`, `PROTO_BPS_HALF = 25`. flexforex also `RNG = rng`, `RNG_NUMBERS = 1`, `RNG_LUCK = 2`.

## Shared `launch` row (`launches`, scope = contract)

`token_symbol`, `quote` (extended_asset, amount 0), `fee`, `tick_lower`, `tick_upper`, `sqrt_price_x64`, `proof_pool_id`, `flex_quote`, `launched`, `pool_id`, `pos_id`, `nyra_bps`, `refl_bps`.

`launched == false` or missing row → wizard in progress. After stamp, `reglaunch` refuses further edits.

## Shared `flexpool` row (`flexpools`, scope = symbol)

`id` (Alcor pool id; upsert may replace id for the same output pair), `input_symbol`, `input_contract` (`get_self()`), `output_symbol`, `output_contract`. One logical route per (this token → output contract+symbol).

## Shared `account` (`accounts`, scope = owner)

`balance` asset. PK = symbol code.

## `stat` (`stat`, scope = symbol)

| Field | easyflex | complexflex | flexforex |
|-------|----------|-------------|-----------|
| supply, max_supply, issuer | yes | yes | yes |
| reflection_pool | yes | yes | yes |
| burn_pool | yes | yes | yes |
| project_pool | — | yes | yes |
| numbers_pool, luck_pool | — | — | ABI pad only |
| numbers_last, flexer_count | — | — | yes |

## `settings` (`settings`, scope = symbol)

| Field | easyflex | complexflex | flexforex |
|-------|----------|-------------|-----------|
| token_symbol, start_key, limit | yes | yes | yes |
| reflection_rate | default 100 | default 100 | default 100 |
| burn_rate | default **100** | default 0 | default 0 |
| project_rate, project_account | — | default 100 / issuer | default 100 / issuer |
| admin_account | issuer | issuer | issuer |
| dist_locked, numbers_bps, luck_bps, luck_winners, luck_min_hold, numbers_cooldown, keeper_min, reflect_min, rng_kind, rng_amt | — | — | flexforex only |

`limit` 1–1000 on `setconfig`. Sum of tax rates ≤ 10000.

## `flexer` (`flexers`, scope = symbol)

| Field | easyflex | complexflex | flexforex |
|-------|----------|-------------|-----------|
| owner, balance, is_banned, flextoken | yes | yes | yes |
| beneficiary, bene_rate, custom_memo | — | yes | yes |
| pick (numbers; 1000 = unset) | — | — | yes |
| secondary `bynumber` | — | — | yes |

## Actions — create / money

**Auth:** create/forge = issuer; issue/mint = issuer, `to` must be issuer; burn = holder; open = ram_payer; close = owner with zero balance.

**easyflex:** `create`, `issue`, `burn`, `transfer`, `open`, `close`  
**complexflex / flexforex:** `forge`, `mint`, `burn`, `transfer`, `open`, `close`

Mint/issue error if token missing: `"create token before issue"`.

## Actions — launch

Identical ABI on all three:

```
reglaunch(token_symbol, quote, fee, tick_lower, tick_upper, sqrt_price_x64, proof_pool_id)
stamp(token_symbol, pool_id, tick_lower, tick_upper)
```

Auth: **issuer**. Flex quotes: EASY@mon3y, WON@w3won, MEME@m3m3, GRAMS@gold.mon3y → `proof_pool_id` must be 0. Else quote contract must be `xtokens`, proof pool active, contains that xtoken vs XUSDC@xtokens or XPR@eosio.token, Alcor inventory ≥ **10 XUSDC** or **1000 XPR** (valued with pool `sqrtPriceX64`).

Stamp errors to surface in UI: pool not active (`activepool#id`), fee mismatch, pair mismatch, one-sided tick, no liquidity, lock < 90d, not 100% on swap.alcor, unused Alcor balance.

## Actions — config / ban

| Action | Who | Notes |
|--------|-----|--------|
| `setconfig` | **contract only** | easyflex: no project fields. Others: project_rate + project_account. |
| `noflexzone` / `renounce` | self can only **ban** (`ban_status` true); admin/issuer/contract can unban | Self cannot restore reflections |

## Actions — payout

| Contract | Action | Extra |
|----------|--------|--------|
| easyflex | `distribute(token_symbol)` | No inheritance; flextoken swap memos; burn_pool flushed after a std pay |
| complexflex | `reflect(token_symbol)` | Inheritance split; flextoken; burn flush |
| flexforex | `reflect(token_symbol, keeper)` | Same + numbers reserved in pool (not paid here) + luck RNG + optional keeper tip if `keeper_min > 0` (keeper must `require_auth`) |

Payout requires `launches.launched`. Skim `nyra` / `reflections` from standard slice using launch bps. Pagination via `start_key`.

flexforex standard/luck pay 61.8%; numbers slice stays until `pullnumber`/`receiverand`. `reflect_min` default = one whole token unit if unset.

## Actions — flex-to (Alcor output)

Issuer or contract: `setflexpool` / `addpool(pool_id, token_symbol, output_symbol, output_contract)` — pool must be active and pair this token with that output.

Holder (or issuer/admin/contract via `require_token_auth`): `setflextoken` / `interestoken`. Zero `output_contract` clears route.

## Actions — inheritance (complexflex + flexforex)

`inheritance(flexer, beneficiary, rate, token_symbol)` — rate ≤ 10000 bps of the reflection share. Empty beneficiary → self.  
`inheritmemo(flexer, custom_memo, token_symbol)` — memo ≤ 200; placeholders `@@` replaced with recipient name on payout. Auth: flexer or contract.

## Actions — flexforex Numbers / Luck only

`setratios(token_symbol, numbers_bps, luck_bps)` — issuer or contract.  
`setdist(...)` — see header; locks issuer after first success.  
`setnumber(owner, token_symbol, code)` — 0–999.  
`pullnumber(token_symbol)` — cooldown; needs numbers_bps and cooldown; `rng_kind` idle.  
`receiverand(assoc_id, random_value)` — `rng` only.

## Alcor issuer actions (not on these contracts)

Signed by issuer against `swap.alcor`: `createpool`, `addliquid`, `lockpos`, and `eosio.token`/`xtokens`/`flex token` `transfer` for deposit / `activepool#id`. Pool id from `logpool` or scan `pools`.

## Signing cheatsheet

```
create/forge     issuer@active
issue/mint       issuer@active
reglaunch        issuer@active
stamp            issuer@active
setconfig        contract@active
addpool/setflexpool  issuer or contract
distribute/reflect   anyone (flexforex keeper@active if keeper_min > 0)
receiverand      rng@active
```
