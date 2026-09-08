---
name: flex-project-contracts
description: >-
  Source of truth for this repo’s live flex token contracts in src/Project Contracts
  (easyflex, complexflex, flexforex): create, startlaunch, liftoff, choosereward,
  feeoptout, tables, taxes, reflections, Alcor wiring. Use when building Flex Launcher
  UI, launch wizards, reflections/portfolio, RPC table reads, or any easyflex /
  complexflex / flexforex / flex.mon3y / mon3y / gold.mon3y work. Prefer these files
  and AGENTS.md over UI-LAUNCH.md.
---

# Flex project contracts (this repo)

## Instructions

1. **Read the C++ first.** Canonical sources: `src/Project Contracts/*.hpp` and `*.cpp`. If header and cpp disagree, the cpp is runtime truth.
2. Open **[tables-and-actions.md](tables-and-actions.md)** before signing or querying.
3. For the launcher product (screens, env, wizard order), follow **[AGENTS.md](../../../AGENTS.md)** and `.cursor/rules/flex-launcher-ui.mdc`.
4. Match Vite patterns in `src/services/`, `src/config/launch.ts`, wallets. Alcor AMM is `swap.alcor` — `alcor-exchange` skill for memos/URLs.
5. `token_symbol` action args are the **symbol code string** (`FOO`), not `"4,FOO"`.
6. Never invent ABI fields. Never emit stale names listed below.

`UI-LAUNCH.md` is stale (`forge`, `reglaunch`, `stamp`, `settings` contract-scoped). Trust `src/Project Contracts`.

## Three products, one launch law

`create` → mint/issue **100% to issuer** → `startlaunch` → issuer on `swap.alcor` (`createpool`, deposit, one-sided `addliquid`, `lockpos` ≥ 90d) → `liftoff`.

Until `launches.launched == true`, transfers may only go to `swap.alcor` (plus contract self-pays and the Alcor-path list). After liftoff, skim bps on the launch row are sticky.

| Contract | Typical account (confirm env / explorer) | Create | Supply | Payout | Opt-out | Flex-to |
|----------|------------------------------------------|--------|--------|--------|---------|---------|
| `easyflex` | `mon3y` (EASY) | `create` | `issue` | `makeitrain(token, sender)` | `feeoptout` | `addpool` + `choosereward` |
| `complexflex` | `gold.mon3y` (GRAMS) | `create` | `mint` | `makeitrain(token, sender)` | `feeoptout` | same |
| `flexforex` | `flex.mon3y` (`VITE_FLEXFOREX_CONTRACT`) | `create` | `mint` | `makeitrain(token, keeper)` | `feeoptout` | same |

**easyflex:** no inheritance, project tax, angel numbers, or jackpot. Default tax 1% reflect + 1% burn.

**complexflex:** inheritance + project tax; no RNG. Default 1% reflect + 1% project.

**flexforex:** plus angel numbers, jackpot, `rng`, `setdist` / `ratios`, keeper tip. Default 1% reflect + 1% project.

Rates are bps / 10000 (100 = 1%). Payout sends 38.2% of the standard pool (`PAY_NUM/PAY_DEN` = `382/1000`).

## Stale names (never emit)

`forge` → `create`. `reglaunch` → `startlaunch`. `stamp` → `liftoff`. `interestoken` / `setflextoken` / `setflexpool` → `addpool` / `choosereward`. `renounce` / `noflexzone` → `feeoptout`. `setratios` → `ratios`. `setnumber` / `pullnumber` → `setangelnum` / `pullangel`. `distribute` / `reflect` → `makeitrain`. Launch fields: `xtoken_proof_pool_id`, `pure_liquid_alcor_pool_id`, `position_id`, `dev_bps`, `club_bps`. Flexer: `fee_opted_out`, `flex_reward_pool_id`, `angel_number`, index `byangel`.

## Accounts

From `src/config/launch.ts` / env: `VITE_FLEXFOREX_CONTRACT`, `VITE_EASYFLEX`, `VITE_COMPLEXFLEX`. Quotes: EASY@mon3y, WON@w3won, MEME@m3m3, GRAMS@gold.mon3y. xtokens; XPR `eosio.token` p4; XUSDC `xtokens` p6. AMM `swap.alcor`. Alcor UI `https://alcor.exchange/v/xpr`.

## RPC scopes

| Table | scope | PK |
|-------|-------|-----|
| `stat`, `settings`, `flexers`, `flexpools` | **symbol code raw** | symbol / owner / pool id |
| `accounts` | owner | symbol |
| `launches` | **contract name** | symbol |

flexforex `flexers` secondary: `byangel`.

## UI rules

- One wizard, three adapters. Hide ABI the chosen contract lacks.
- Do not sign `linkauth`. Do not call `setconfig` or `receiverand` from issuer UI.
- `token.proton` logos still need `tcontract@active` (token **contract** account).
- Check strings start with `⟁`. Map in `src/services/txParse.ts`.
- No `on_notify` LP `Col…` forward on these three contracts.

## Related

- Launcher brief: [AGENTS.md](../../../AGENTS.md)
- Alcor: `.agents/skills/alcor-exchange`
- Wallets: `.agents/skills/web-sdk`, `src/services/walletConstants.ts`
- Wire testnet: `.cursor/skills/wire-testnet`
