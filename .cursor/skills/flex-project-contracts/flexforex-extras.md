# flexforex extras (not easyflex / mostly not complexflex)

Source: `src/Project Contracts/flexforex.hpp` + `.cpp`. complexflex shares inheritance + project tax only.

## UI status

Launcher ships:

- public poke: `pullangel` / `pulljackpot` (+ pot chips)
- token manage page: issuer `setdist` / `ratios` / `addpool`; holder `setangelnum` / inheritance / `choosereward` / `feeoptout`

Gate angel channel UI to `program === "flexforex"`; inheritance to complexflex + flexforex.

---

## Transfer tax split (flexforex)

On taxed transfer, `reflection_rate` (bps of transfer) is cut:

1. `angel = reflection_fee * angel_numbers_bps / 10000` → `stat.angel_numbers_pool`
2. `jack  = reflection_fee * jackpot_bps / 10000` → `stat.jackpot_pool`
3. remainder → `stat.reflection_pool`

`makeitrain` splashes **only** `reflection_pool`. Angel / jackpot never mix into the standard splash.

`angel_numbers_bps + jackpot_bps ≤ 10000`.

---

## `ratios(token_symbol, angel_numbers_bps, jackpot_bps)`

- Auth: **issuer or contract**
- Updates channel bps only (share of `reflection_rate` on transfer)
- Does not lock `dist_locked`
- Does not set winners / cooldown / mins

## `setdist(token_symbol, angel_numbers_bps, jackpot_bps, jackpot_winners, jackpot_min_hold, angel_numbers_cooldown, keeper_min, reflect_min)`

- Auth: issuer/admin via `require_token_auth` **once** (`dist_locked` must be false); **contract** may call again anytime
- Always sets `dist_locked = true`
- If `jackpot_bps > 0` → `jackpot_winners > 0`
- If `angel_numbers_bps > 0` → `angel_numbers_cooldown > 0`
- Does **not** change tax / burn / project rates (those are issuer `setfees`; `setconfig` is contract-only and does not write tax)

Typical first-run issuer flow after launch: `setdist` with desired channel ops, then holders `setangelnum`.

## `setangelnum(owner, token_symbol, angel_number)`

- Auth: **owner**
- `angel_number` ∈ **0-999** (1000 on the flexer row means unset)
- Requires `settings.angel_numbers_bps > 0` (“angel numbers not enabled”)
- Ensures flexer row; indexed by `byangel` for payout matching

## `pullangel(token_symbol)`

- Anyone may call
- Requires `angel_numbers_bps` and `angel_numbers_cooldown`
- Cooldown vs `stat.angel_numbers_last`
- Pot `angel_numbers_pool > 0`, `rng_kind == 0`
- Zeros pot, stamps last time, `request_rng(assoc=symbol_code, kind=RNG_NUMBERS, amt=pot)`
- Payout happens in `receiverand` to holders whose `angel_number` matches the draw

## `pulljackpot(token_symbol)`

- Anyone may call
- Requires `jackpot_bps` and `jackpot_winners > 0`
- Pot `jackpot_pool > 0`, `rng_kind == 0`
- Zeros pot, `request_rng(..., RNG_JACKPOT, pot)`
- `receiverand` picks winners; `jackpot_min_hold` checked **after** draw

## `receiverand(assoc_id, random_value)`

- Auth: **`rng` only**  -  never from UI
- `assoc_id` = token symbol code raw
- Clears `rng_kind` / `rng_amt` then pays reserved pot

## Inheritance (complexflex + flexforex)

### `inheritance(flexer, beneficiary, rate, token_symbol)`

- Auth: flexer or contract
- `rate` ≤ 10000 (bps of the holder’s splash that goes to beneficiary)
- Empty beneficiary → self
- Stored on flexer: `beneficiary`, `bene_rate`

### `inheritmemo(flexer, custom_memo, token_symbol)`

- Auth: flexer or contract
- memo ≤ 200 chars; used with `@@` on payout memos

On makeitrain, complex/forex split the holder share by `bene_rate` between flexer and beneficiary.

## Flex-to (all three)

### `addpool(pool_id, token_symbol, output_symbol, output_contract)`

- Auth: issuer or contract
- Fail copy: `⟁ Only the issuer can add a flex reward token.`
- Pool must be active on `swap.alcor` and pair this token with that exact output

### `choosereward(owner, token_symbol, output_symbol, output_contract)`

- Auth: owner, or issuer/admin/contract via `require_token_auth`
- Empty `output_contract` → `flex_reward_pool_id = 0` (native / underlying-default path)
- Else must match a `flexpools` row for that output

## Fee opt-out (all three)

`feeoptout(account, ban_status, token_symbol)`

- Self may only set `ban_status = true` (irreversible for self)
- Admin/issuer/contract may toggle either way
- Opted-out holders skip transfer tax and typically leave the reflect denom

## Suggested UI surfaces

| Screen | Actions |
|--------|---------|
| `/token/:contract/:symbol` (issuer) | `setfees`, `setdist` (if !dist_locked), `ratios`, `addpool` |
| `/manager` | `setfees`; for3x `ratios` for the selected issuer token |
| `/token/:contract/:symbol` (holder) | `choosereward`, `feeoptout`, `setangelnum` (forex), `inheritance` / `inheritmemo` (complex/forex) |
| Portfolio / Leaderboard | links + public poke |

Never put tax sliders that call `setconfig` in the issuer wizard. Overall tax is issuer `setfees` after create, and again in Manager (cannot raise total or lower reflection). for3x uses `ratios` / `setdist` for a share of `reflection_rate` only.
