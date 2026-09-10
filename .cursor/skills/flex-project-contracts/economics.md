# Economics  -  tax, skim, splash, underlying

Source: `src/Project Contracts/*.cpp` transfer + makeitrain + liftoff paths.

## Transfer tax

Unless sender is the contract (distribution), fee-opted-out, or pre-liftoff Alcor seed:

| Rate field | easyflex | complexflex / flexforex |
|------------|----------|-------------------------|
| `reflection_rate` | → `reflection_pool` | → split (forex) or pool (complex) |
| `burn_rate` | → `burn_pool` | usually 0 at create |
| `project_rate` |  -  | → `project_pool` / `project_account` |

Defaults at create: all rates **0**. Issuer `setfees` sets the split (UI suggests 1% reflect + 1% burn on easyflex, 1% reflect + 1% project otherwise). Later `setfees` cannot raise the total or lower reflection. `setconfig` (contract@active) does not write tax.

flexforex further splits the reflection fee by `angel_numbers_bps` / `jackpot_bps` into live pots (see [flexforex-extras.md](flexforex-extras.md)).

## Protocol skim (post-liftoff)

On makeitrain (and optionally via `checklock`):

- Take `dev_bps` of the pending standard pool → account `nyra`
- Take `club_bps` → account `reflections`
- Set at liftoff: `0` if flex quote, else `25` (0.25%) each
- If Alcor LP is unlocked after `unlock_time`, may rise once by another `25` each (`maybe_apply_unlock_fee`)

## makeitrain splash

1. Require launched + auth (`sender` or `keeper`)
2. Apply unlock fee if due
3. Skim protocol bps
4. Splash **`PAY_NUM/PAY_DEN` = 38.2%** of remaining `reflection_pool` across eligible flexers (paginate `start_key` / `limit`)
5. Optional keeper tip if `keeper_min > 0` (flexforex)
6. Flush `burn_pool` after a successful standard pay (easy/complex)

Eligible denom excludes vault accounts (program-specific: `alcor`, token contract, `swap.alcor`, etc.  -  see `FLEX_PROGRAMS[].vaults` in `src/config/launch.ts`).

UI estimate: `reflection_pool * 0.382 * (balance / (supply - vaults))`.

## Underlying / flex reward routing

When paying a holder share:

```
pid = flexer.flex_reward_pool_id
if pid == 0 && launch.swap_underlying_default:
    pid = launch.pure_liquid_alcor_pool_id
```

Then:

- Resolve output from `flexpools[pid]`, **or** if pid is the launch pool, use `launch.quote`
- If output is not the native token: transfer to `swap.alcor` with  
  `swapexactin#<oid>#<recipient>#<min> <SYM>@<contract>#0#reflections`
- Else: pay native token to holder (and beneficiary split if inheritance)

Issuer chooses `swap_underlying_default` at `startlaunch` (wizard checkbox). Holders override via `choosereward` once issuer `addpool`s routes.

## Quote classes (skim + proof)

| Class | Examples | Liftoff skim | Proof pool |
|-------|----------|--------------|------------|
| Flex quote | EASY/WON/MEME/GRAMS | 0% | must be 0 |
| Non-flex | xtoken, XPR, XMD, LOAN | 0.25%+0.25% | id **> 0** vs XUSDC or XPR |

## Pre-liftoff

Until `launches.launched`, transfers may only go to `swap.alcor` (plus contract self-pays and listed Alcor-path accounts). Fail copy starts with `⟁ Place a one-sided Alcor range…`.
