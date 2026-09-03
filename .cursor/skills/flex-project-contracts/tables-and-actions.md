# Tables and actions — `src/Project Contracts`

Copied from Flex-Forex and verified against `src/Project Contracts` headers. Constants: `SWAP_ALCOR = swap.alcor`, `XTOKENS = xtokens`, `MIN_LOCK_SECS = 7776000`, `MIN_TICK/MAX_TICK = ±443636`, `PROTO_BPS_HALF = 25`. flexforex also `RNG = rng`, `RNG_NUMBERS = 1`, `RNG_JACKPOT = 2`.

## Shared `launch` row (`launches`, scope = contract)

`token_symbol`, `quote` (extended_asset, amount 0), `fee`, `tick_lower`, `tick_upper`, `sqrt_price_x64`, **`xtoken_proof_pool_id`**, `flex_quote`, `launched`, **`pure_liquid_alcor_pool_id`**, **`position_id`**, **`dev_bps`**, **`club_bps`**.

`launched == false` or missing row → wizard in progress. After liftoff, `startlaunch` refuses further edits.

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
| angel_numbers_pool, jackpot_pool | — | — | ABI pad only |
| angel_numbers_last, flexer_count | — | — | yes |

## `settings` (`settings`, scope = symbol)

| Field | easyflex | complexflex | flexforex |
|-------|----------|-------------|-----------|
| token_symbol, start_key, limit | yes | yes | yes |
| reflection_rate | default 100 | default 100 | default 100 |
| burn_rate | default **100** | default 0 | default 0 |
| project_rate, project_account | — | default 100 / issuer | default 100 / issuer |
| admin_account | issuer | issuer | issuer |
| dist_locked, angel_numbers_bps, jackpot_bps, jackpot_winners, jackpot_min_hold, angel_numbers_cooldown, keeper_min, reflect_min, rng_kind, rng_amt | — | — | flexforex only |

`limit` 1–1000 on `setconfig`. Sum of tax rates ≤ 10000.

## `flexer` (`flexers`, scope = symbol)

| Field | easyflex | complexflex | flexforex |
|-------|----------|-------------|-----------|
| owner, balance | yes | yes | yes |
| fee_opted_out | yes | yes | yes |
| flex_reward_pool_id | yes | yes | yes |
| beneficiary, bene_rate, custom_memo | — | yes | yes |
| angel_number (1000 = unset) | — | — | yes |
| secondary `byangel` | — | — | yes |

## Actions — create / money

**Auth:** create = issuer; issue/mint = issuer, `to` must be issuer; burn = holder; open = ram_payer; close = owner with zero balance.

**easyflex:** `create`, `issue`, `burn`, `transfer`, `open`, `close`  
**complexflex / flexforex:** `create`, `mint`, `burn`, `transfer`, `open`, `close`

Mint/issue error if token missing: `"create token before issue"`.

## Actions — launch

Identical ABI on all three:

```
startlaunch(token_symbol, quote, fee, tick_lower, tick_upper, sqrt_price_x64, xtoken_proof_pool_id)
liftoff(token_symbol, pool_id, tick_lower, tick_upper)
```

Auth: **issuer**. Flex quotes: EASY@mon3y, WON@w3won, MEME@m3m3, GRAMS@gold.mon3y → `xtoken_proof_pool_id` must be 0. Else quote contract must be `xtokens`, proof pool active, contains that xtoken vs XUSDC@xtokens or XPR@eosio.token, Alcor inventory ≥ **10 XUSDC** or **1000 XPR**.

Liftoff errors: pool not active (`activepool#id`), fee mismatch, pair mismatch, one-sided tick, no liquidity, lock < 90d, not 100% on swap.alcor, unused Alcor balance.

## Actions — config / opt-out

| Action | Who | Notes |
|--------|-----|--------|
| `setconfig` | **contract only** | easyflex: no project fields. Others: project_rate + project_account. |
| `feeoptout` | self can only **opt out** (`ban_status` true); admin/issuer/contract can toggle either way | Self cannot restore reflections |

## Actions — payout

| Contract | Action | Extra |
|----------|--------|--------|
| easyflex | `distribute(token_symbol)` | No inheritance; `flex_reward_pool_id` swap memos; burn_pool flushed after a std pay |
| complexflex | `reflect(token_symbol)` | Inheritance split; reward pool; burn flush |
| flexforex | `reflect(token_symbol, keeper)` | Same + angel-numbers reserved in pool + jackpot RNG + optional keeper tip if `keeper_min > 0` |

Payout requires `launches.launched`. Skim: `dev_bps` → account `nyra`; `club_bps` → account `reflections`. Pagination via `start_key`.

flexforex standard/jackpot pay 61.8%; angel-numbers slice stays until `pullangel`/`receiverand`. `reflect_min` default = one whole token unit if unset.

## Actions — flex-to (Alcor output)

Issuer or contract: `addpool(pool_id, token_symbol, output_symbol, output_contract)`.

Holder (or issuer/admin/contract): `choosereward`. Zero `output_contract` clears `flex_reward_pool_id`.

## Actions — inheritance (complexflex + flexforex)

`inheritance(flexer, beneficiary, rate, token_symbol)` — rate ≤ 10000. Empty beneficiary → self.  
`inheritmemo(flexer, custom_memo, token_symbol)` — memo ≤ 200; `@@` on payout. Auth: flexer or contract.

## Actions — flexforex angel numbers / jackpot only

`ratios(token_symbol, angel_numbers_bps, jackpot_bps)` — issuer or contract.  
`setdist(...)` — locks issuer after first success.  
`setangelnum(owner, token_symbol, angel_number)` — 0–999.  
`pullangel(token_symbol)` — cooldown; `rng_kind` idle.  
`receiverand(assoc_id, random_value)` — `rng` only.

## Alcor issuer actions (not on these contracts)

`swap.alcor`: `createpool`, `addliquid`, `lockpos`; token `transfer` for deposit / `activepool#id`. Pool id from `logpool`.

## Signing cheatsheet

```
create            issuer@active
issue/mint        issuer@active
startlaunch       issuer@active
liftoff           issuer@active
setconfig         contract@active
addpool           issuer or contract
distribute/reflect  anyone (flexforex keeper@active if keeper_min > 0)
receiverand       rng@active
```

## Old names (do not use)

`forge`, `reglaunch`, `stamp`, `renounce`, `noflexzone`, `setflexpool`, `setflextoken`, `interestoken`, `setratios`, `setnumber`, `pullnumber`, `proof_pool_id`, `pool_id`/`pos_id` on launches, `nyra_bps`/`refl_bps`, `is_banned`, `flextoken`, `numbers_*` / `luck_*` table fields, `bynumber`.
