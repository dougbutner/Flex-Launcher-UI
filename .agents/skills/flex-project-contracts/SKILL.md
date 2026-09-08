---
name: flex-project-contracts
description: >-
  Source of truth for live flex token contracts in src/Project Contracts
  (easyflex, complexflex, flexforex): every action/table, flexforex extras, and
  UI coverage gaps. Use when building Flex Launcher UI. Prefer AGENTS.md and
  these contracts over UI-LAUNCH.md.
---

# Flex project contracts

## Instructions

1. Open **[`.cursor/skills/flex-project-contracts/SKILL.md`](../../../.cursor/skills/flex-project-contracts/SKILL.md)** (product split + UI gap).
2. Then the matching reference:
   - **[tables-and-actions.md](../../../.cursor/skills/flex-project-contracts/tables-and-actions.md)** — ABI / RPC
   - **[flexforex-extras.md](../../../.cursor/skills/flex-project-contracts/flexforex-extras.md)** — setdist, ratios, angel, jackpot, inheritance
   - **[economics.md](../../../.cursor/skills/flex-project-contracts/economics.md)** — tax, skim, splash, underlying
3. Wizard / env / screens: **[AGENTS.md](../../../AGENTS.md)** + **`.cursor/rules/flex-launcher-ui.mdc`**.
4. Canonical C++ is **`src/Project Contracts/`**. Never emit `forge` / `reglaunch` / `stamp`.

## UI gap (quick)

Shipped: launch wizard, `makeitrain`, `checklock`, `pullangel` / `pulljackpot`, `swap_underlying_default`, token manage (`setdist` / `ratios` / `setangelnum`, inheritance, `addpool` / `choosereward`, `feeoptout`).  
Never: `setconfig`, `receiverand`.
