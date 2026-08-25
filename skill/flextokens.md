# Flextokens on XPR Network

Use this module when building dApps that interact with **Flex tokens**—reflection-style assets on XPR where transfer tax funds **proportional rewards** to holders (and sometimes burns). Holders often **choose which token they receive** as a daily reward (BTC, SOL, other Flex tokens, etc.).

> **Full reference in-repo:** see [`flex-tokens.md`](../flex-tokens.md) in the project root (links, explorer actions, community notes).  
> **Intro course (Notion):** [Flex Tokens Liftoff: EASY, GRAMS, WON & MEME](https://aquariusacademy.notion.site/Flex-Tokens-Liftoff-EASY-GRAMS-WON-MEME-206ac693574b80e5aca2ddd57156b265)  
> **Ecosystem index:** [flex.report](https://flex.report)

---

## Tokens you will see most often

| Token | Notes (high level) |
|-------|-------------------|
| **EASY** | “Take it EASY” — e.g. ~2% reflection (see live docs for current params) |
| **WON** | Reflection + team allocation; reward choice via `w3won` patterns |
| **MEME** | Reflection + burn split |
| **GRAMS** | Same family; confirm tokenomics on Notion / explorer |

Symbols on DEXs often look like **GRAMS-gold.mon3y**, **EASY-mon3y**, **WON-w3won**, **MEME-m3m3** (pair naming on Alcor-style UIs).

---

## Contracts & actions (integration surface)

Always **re-verify** `account`, `action`, and ABI on [XPR Network Explorer](https://explorer.xprnetwork.org/) before mainnet calls. In-repo sources: `contracts/TEMP/takeiteasy.hpp` (**takeiteasy**), `contracts/TEMP/seedoflife.hpp` (**seedoflife**), `contracts/TEMP/grams.hpp` (**grams**).

Mainnet accounts (explorer): [gold.mon3y](https://explorer.xprnetwork.org/account/gold.mon3y) (GRAMS), [w3won](https://explorer.xprnetwork.org/account/w3won) (WON), [mon3y](https://explorer.xprnetwork.org/account/mon3y) (EASY), [m3m3](https://explorer.xprnetwork.org/account/m3m3) (MEME).

Action names below were checked against live ABIs via chain RPC (`get_abi`, mainnet); explorer shows the same ABI.

### GRAMS — `gold.mon3y` (interface: **grams**)

| Category | Actions |
|----------|---------|
| Token ops | `forge`, `mint`, `smelt`, `transfer`, `open`, `close` |
| Reflection / config | `reflect`, `setconfig` |
| Flex pools & reward token | `addpool`, `interestoken` |
| Holder tree (referral-style) | `inheritance`, `inheritmemo` |
| Tax / ban | `renounce` |

### WON — `w3won` (interface: **seedoflife**)

| Category | Actions |
|----------|---------|
| Token ops | `create`, `issue`, `burn`, `transfer`, `open`, `close` |
| Reflection / config | `radiate`, `setconfig` |
| Flex pools & reward token | `addpool`, `sprouttoken` |
| Holder tree | `settree`, `settreememo` |
| Tax opt-out | `optoutoftax` |

### EASY — `mon3y` and MEME — `m3m3` (same interface: **takeiteasy**)

| Category | Actions |
|----------|---------|
| Token ops | `create`, `issue`, `burn`, `transfer`, `open`, `close` |
| Reflection / config | `distribute`, `setconfig` |
| Flex pools & reward token | `setflexpool`, `setflextoken` |
| Fee / rewards opt-out | `noflexzone` |

**Patterns for UIs:** read pending reward context via explorer or tables; let users **change reward token** with `setflextoken` (mon3y / m3m3), `sprouttoken` (w3won), or `interestoken` (gold.mon3y)—each account uses its own action name and parameter shapes; never assume opt-out (`noflexzone`, `optoutoftax`, `renounce`) is reversible without checking the contract.

---

## DeFi touchpoints

- Swaps: **`https://alcor.exchange/v/xpr/swap`** / **`https://alcor.exchange/v/xpr/swap-widget`** (ids e.g. `XUSDC-xtokens`).
- Optional **farm** rewards may exist per token—check current farm UIs and docs.

---

## Building with this template

- Wallet: **WebAuth** + **Anchor**, multi-account — use the active signer for `transact` when pushing Flex-related actions.
- Prefer **small test transactions** on testnet or with minimal amounts when exploring new action parameters.

---

## Disclaimer

Flex token mechanics and parameters can change. **Not financial or legal advice.** Confirm every action name, authority, and memo requirement on-chain before shipping production UIs.
