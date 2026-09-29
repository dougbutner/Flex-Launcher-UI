# Flex Launcher

Vite app for launching and using Flex tokens on **XPR mainnet**. Three programs, one wizard:

| Program | Account | What it is |
|---------|---------|------------|
| easyflex | `3asy` | Reflections and burn |
| complexflex | `fl3x` | Plus project tax and inheritance |
| flexforex | `for3x` | Plus angel numbers and jackpot |

Token identity is always **contract + symbol**. Contract source of truth is `src/Project Contracts/` (`easyflex`, `complexflex`, `flexforex`). Do not follow action names in `UI-LAUNCH.md` (`forge`, `reglaunch`, `stamp`). Those names are stale.

## What the app does

- **Launch** (`/launch`): create, set fees, mint or issue 100% to the issuer, `startlaunch`, seed a one-sided Alcor range, lock it, optional insider window, liftoff, then `addpool` the quote pair.
- **Events** (`/events`): drop calendar.
- **Token** (`/token/:contract/:symbol`): chart, holder prefs, issuer tools, club chat, insider window when one is on.
- **Make it Rain** (`/reflections`): call `makeitrain`. On flexforex, also `pullangel` and `pulljackpot`.
- **My Bags** (`/portfolio`), **Winners** (`/leaderboard`), **Dev Tools** (`/manager`) for issuers, **Admin** (`/admin`) only when the connected account is `3asy`, `fl3x`, or `for3x`.

Issuer tax is `setfees` after create. Rates start at 0. This UI does not call `setconfig` or `receiverand`.

## Launch law (short)

1. `create` writes the token. Fees are still 0.
2. `setfees`. First split can be anything up to 100%. Later calls cannot raise the total or lower reflection.
3. `issue` (easyflex) or `mint` (the other two), 100% to the issuer.
4. `startlaunch`. Quote amount is 0. `swap_underlying_default` defaults to true, so unpaid holders can be paid in the launch quote.
5. Issuer signs Alcor: `createpool`, activate if needed, `transfer` memo `deposit`, one-sided `addliquid`, `lockpos` at least 91 days in the UI so the chain's 90-day check still passes.
6. Optional `setpresale` (and invites) after the lock, before liftoff. If a presale row exists, liftoff leaves the token gated until `golive`.
7. `liftoff`, then `addpool` of the launch quote pair.

EASY hold at liftoff, whole tokens, times (tokens this issuer already launched on that contract + 1):

- `3asy`: 5,000
- `fl3x`: 10,000
- `for3x`: 50,000

From 9 Sep 2026 00:00 UTC, XPR, XMD, LOAN, and xtokens are 90% off that hold. The discount drops 10 points every 30 days until it is gone. EASY, WON, GRAMS, and MEME stay at 10% of the full hold and do not rise. A verified first GEASY launch has no EASY hold. The hold is a balance check on `mon3y`, not a fee the contract spends.

Flex quotes (EASY, WON, GRAMS, MEME, GEASY) take no protocol skim. Other quotes start at 0.25% to dev and 0.25% to Contributor's Club, and that pair can rise once by the same amount after the LP unlocks. `makeitrain` splashes 38.2% of the reflection pool.

## Stack

Vite, React, TypeScript, Tailwind, `@proton/web-sdk` and WharfKit (WebAuth and Anchor). XPR mainnet only.

```bash
npm install
npm run dev      # http://localhost:8080
npm run build
npm run test
```

Chain id `384da888112027f0321850a169f737c33e53b388aad48b5adace4bab97f437e0`. RPC `https://proton.greymass.com`.

Env: `VITE_EASYFLEX=3asy`, `VITE_COMPLEXFLEX=fl3x`, `VITE_FLEXFOREX_CONTRACT=for3x`, `VITE_SWAP_ALCOR=swap.alcor`. Liftoff reads EASY on `mon3y`, not `VITE_EASYFLEX`.

## Where to read more

- Product and screens: `AGENTS.md`
- Contract actions and tables: `.cursor/skills/flex-project-contracts/`
- Public book: [flex.report](https://flex.report), including Launch your own
