# Tables and actions  -  `src/Project Contracts`

Verified against live headers/cpp. Constants: `SWAP_ALCOR=swap.alcor`, `XTOKENS=xtokens`, `MON3Y=mon3y`, `MIN_LOCK_SECS=7776000`, `MIN_TICK/MAX_TICK=±443636`, `PROTO_BPS_HALF=25`, `PAY_NUM/PAY_DEN=382/1000`. flexforex also `RNG=rng`, `RNG_NUMBERS=1`, `RNG_JACKPOT=2`.

## RPC scopes

| Table | scope | PK |
|-------|-------|-----|
| `stat`, `settings`, `flexers`, `flexpools` | **symbol code raw** | symbol / owner / pool id |
| `accounts` | owner | symbol |
| `launches` | **contract account** | symbol |

flexforex `flexers` secondary index: `byangel`.

## `launches` (contract scope)

`token_symbol`, `quote` (extended_asset, amount **0**), `fee`, `tick_lower`, `tick_upper`, `sqrt_price_x64`, `xtoken_proof_pool_id`, `flex_quote`, `launched`, `pure_liquid_alcor_pool_id`, `position_id`, `dev_bps`, `club_bps`, `unlock_time`, `swap_underlying_default`.

- Missing row → wizard in progress; transfers only to `swap.alcor`.
- `launched == false` with no `presales` row → same Alcor-only rule.
- `launched == false` after liftoff with a `presales` row → gated insider window until `golive`.
- `launched == true` → do not re-seed Alcor; `startlaunch` refuses further edits.
- After liftoff fills `pure_liquid_alcor_pool_id`, `startlaunch` is locked even if presale left `launched` false.
- Liftoff sets skim: `0` if `flex_quote`, else `25` each. After LP actually unlocks, `checklock` / `makeitrain` may raise both to `PROTO_BPS_HALF` extra (`0→25` or `25→50`).
- `swap_underlying_default`: unpaid holders (`flex_reward_pool_id == 0`) swap into launch quote via `pure_liquid_alcor_pool_id` on makeitrain. Wizard default true.

## `stat` (scope = symbol)

| Field | easy | complex | forex |
|-------|------|---------|-------|
| supply, max_supply, issuer | yes | yes | yes |
| reflection_pool | yes | yes | yes (standard splash only) |
| burn_pool | yes | yes | yes |
| project_pool |  -  | yes | yes |
| angel_numbers_pool, jackpot_pool |  -  |  -  | live pots |
| angel_numbers_last, flexer_count |  -  |  -  | yes |

## `settings` (scope = symbol)

| Field | easy | complex | forex |
|-------|------|---------|-------|
| token_symbol, start_key, limit | yes | yes | yes |
| reflection_rate | 0 until `setfees` | 0 until `setfees` | 0 until `setfees` |
| burn_rate | 0 until `setfees` | 0 until `setfees` | 0 until `setfees` |
| project_rate, project_account |  -  | 0 / issuer until `setfees` | 0 / issuer until `setfees` |
| admin_account | issuer | issuer | issuer |
| reflect_min | issuer `setmin` | issuer `setmin` | via `setdist` |
| dist_locked, angel_numbers_bps, jackpot_bps, jackpot_winners, jackpot_min_hold, angel_numbers_cooldown, keeper_min, rng_kind, rng_amt |  -  |  -  | forex only |

Rates are bps / 10000. `limit` 1-1000 on `setconfig`. Sum of tax rates ≤ 10000 on `setfees`. `create` writes 0 rates; issuer `setfees` sets tax. `setconfig` is contract-only (limit / start_key / admin), not tax. Later `setfees`: new total cannot exceed current, reflection cannot fall. `reflect_min == 0` → treat as 1 whole token (`10^precision`).

## `flexers` (scope = symbol)

| Field | easy | complex | forex |
|-------|------|---------|-------|
| owner, balance, fee_opted_out, flex_reward_pool_id | yes | yes | yes |
| beneficiary, bene_rate, custom_memo |  -  | yes | yes |
| angel_number (1000 = unset; pick 0-999) |  -  |  -  | yes |
| secondary `byangel` |  -  |  -  | yes |

`flex_reward_pool_id == 0` → native **or** launch-quote swap if `swap_underlying_default`. Else Alcor pool id in `flexpools`.

## `flexpools` (scope = symbol)

`id` (Alcor pool id), `input_symbol`, `input_contract` (`get_self()`), `output_symbol`, `output_contract`. One logical route per (this token → output contract+symbol).

## `accounts` (scope = owner)

`balance` asset. PK = symbol code.

---

## Actions  -  money

| Action | Auth | Notes |
|--------|------|-------|
| `create(issuer, maximum_supply)` | issuer | Creates `stat` + `settings` with rates at 0 |
| `setfees` | issuer or contract | easy: refl+burn; complex/forex: + project_rate + project_account. First call any split ≤ 10000. Later: total cannot rise, reflection cannot fall |
| `issue` / `mint` | issuer | **to must be issuer**; 100% for launch |
| `burn` | holder | |
| `transfer` | from (or contract) | Tax unless opted out / contract payout / pre-liftoff Alcor seed |
| `open` / `close` | ram_payer / owner | |

easyflex supply = `issue`. complexflex + flexforex = `mint`.

Wallet→wallet tax is **on top of** `quantity`. Alcor inbound tax is **taken from** `quantity`.

## Actions  -  launch (all three)

```
startlaunch(token_symbol, quote, fee, tick_lower, tick_upper, sqrt_price_x64, xtoken_proof_pool_id, swap_underlying_default)
liftoff(token_symbol, pool_id, tick_lower, tick_upper)
golive(token_symbol)
checklock(token_symbol)
```

- Auth: issuer for startlaunch/liftoff; **issuer or contract** for golive; **anyone** for checklock.
- Flex quotes → proof id **0**. Non-flex → proof id **> 0**, pool active, quote vs XUSDC or XPR, inventory ≥ 10 XUSDC or 1000 XPR valued.
- Liftoff: issuer EASY@mon3y ≥ base×(prior launched by this issuer + 1). Base raw: easy 5e9, complex 1e10, forex 5e10 (precision 6).
- If a `presales` row exists, liftoff fills pool/position/`unlock_time` but leaves `launched` false; `golive` turns it on.
- After liftoff (and golive if presale): issuer `addpool(pure_liquid_alcor_pool_id, token_symbol, quote.quantity.symbol, quote.contract)`.
- Issuer signs Alcor (`createpool`, deposit, `addliquid`, `lockpos` ≥90d)  -  not the flex contract. Never liftoff in same tx as createpool.

## Presale (`presales` / `insiders`, scope = symbol)

`transfer` calls `enforce_presale` only when **not** launched. Absent `presales` row → only `to = swap.alcor`. While a row exists, an approved insider can buy from `swap.alcor` once `now >= insider_time` (still under Insider Max). Everyone else waits until `golive`. Do not add these fields to `stat` / `settings` / `launches`.

`presale`: `token_symbol`, `launch_time`, `insider_time`, `mode` (0 freeze; 1-3 same list+time rules), `insider_bps` (% of issued supply, 0-10000), `locked_insider_bps` (≥ `insider_bps` after `locked_pos`), `collection`, `schema`, `nft_min`, `min_token`, `lp_min`, `locked_lp_min`, `lock_secs`, `need_kyc` (WebAuth `eosio.proton` `usersinfo.verified`), `gates_all` (false = any set gate passes; true = every set gate). Buy gates are NFT, min token, LP, and KYC. Invites (`addinsiders`) and locked-LP bonus are separate.

`insider`: `account`, `approved`, `source` (0 issuer, 1 self), `locked_pos` (Alcor position id; 0 = not proven).

```
setpresale        issuer or contract (before launched)
setlaunchtime     issuer (cannot pull times earlier after that window opens; contract can)
addinsiders       issuer or contract
reginsider        owner (must pass gates)
rminsider         issuer or contract
provelock         owner
golive            issuer or contract (after liftoff filled the launch row)
```

## Actions  -  config / holder prefs

| Action | Who | Contracts |
|--------|-----|-----------|
| `setconfig` | **contract@active only** | all; limit / start_key / admin. Does not write tax |
| `setfees` | issuer or contract | all; tax after create |
| `feeoptout(account, ban_status, token_symbol)` | self: **true only**; admin/issuer/contract either way | all |
| `addpool(pool_id, token_symbol, output_symbol, output_contract)` | issuer or contract | all |
| `choosereward(owner, token_symbol, output_symbol, output_contract)` | owner or issuer/admin/contract; empty output_contract → native (0) | all |
| `inheritance` / `inheritmemo` | flexer or contract | complex + forex |
| `ratios` / `setdist` / `setangelnum` / `pullangel` / `pulljackpot` | see [flexforex-extras.md](flexforex-extras.md) | forex only |
| `setmin(token_symbol, reflect_min)` | issuer | easy + complex (live 3asy / fl3x) |
| `receiverand` | `rng` only | forex only |

## Actions  -  payout

| Contract | Action | Splash |
|----------|--------|--------|
| easyflex | `makeitrain(token_symbol, sender)` | 38.2% of `reflection_pool`; optional Alcor swap memo |
| complexflex | `makeitrain(token_symbol, sender)` | + inheritance split |
| flexforex | `makeitrain(token_symbol, keeper)` | reflection_pool only; optional keeper tip |

Requires `launches.launched`. Skim first: `dev_bps` → `nyra`, `club_bps` → `reflections`. Pagination via `settings.start_key` / `limit`.

Flex swap memo: `swapexactin#<poolId>#<recipient>#<minAmount> <SYM>@<contract>#0#reflections`

## Signing cheatsheet

```
create / setfees / issue|mint / startlaunch / liftoff   issuer@active
golive / setpresale / setlaunchtime / addinsiders / rminsider   issuer or contract
reginsider / provelock                        owner@active
ratios                                        issuer or contract
checklock / pullangel / pulljackpot           anyone (chain gates)
makeitrain                                    sender|keeper@active
addpool                                       issuer or contract
choosereward / feeoptout / setangelnum        holder (see rules)
inheritance / inheritmemo                     flexer or contract
setdist                                       issuer/admin once, or contract anytime
setconfig                                     contract@active
receiverand                                   rng@active
```

## Check strings

On-chain fails start with `⟁`. Surface verbatim; map hints in `src/services/txParse.ts`.

## Old names (do not use)

`forge`, `reglaunch`, `stamp`, `renounce`, `noflexzone`, `setflexpool`, `setflextoken`, `interestoken`, `setratios`, `setnumber`, `pullnumber`, `proof_pool_id`, `nyra_bps`/`refl_bps`, `is_banned`, `distribute`, `reflect`, `numbers_*` / `luck_*` pads.
