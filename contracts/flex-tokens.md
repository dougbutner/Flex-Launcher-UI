# Flex Tokens (reference)

> Primary source: [Flex Tokens Liftoff: EASY, GRAMS, WON & MEME](https://aquariusacademy.notion.site/Flex-Tokens-Liftoff-EASY-GRAMS-WON-MEME-206ac693574b80e5aca2ddd57156b265) (Aquarius Academy on Notion).  
> This file summarizes that page as captured for the project. **Expandable blocks on Notion** (e.g. per-token tokenomics, long-form notes) may contain **additional detail** not fully reproduced below—open the link for the latest wording.

---

## What are Flex Tokens?

Flex Tokens are tokens on **XPR Network** that apply a **transfer tax** and **redistribute** (reflect) proceeds to holders and/or **burn** a portion. Holders receive proportional rewards **directly in their wallets** as a result of activity on the token.

- Each Flex token implements mechanics slightly differently, but they share the idea that you can **choose (“flex”) which token you receive daily** as your reward—options mentioned include **BTC**, **SOL**, other Flex tokens, and more.
- Optional **farming rewards** may also apply: [Alcor farms](https://alcor.exchange/v/xpr/farm).

**Tagline from the guide:** “Buy once and stack tokens forever.”

---

## Tokens covered in the Liftoff guide

| Token | Slogan / label (from page) | Tax / split (as stated) |
|-------|----------------------------|-------------------------|
| **EASY** | “Take it EASY” | **2%** reflection |
| **WON** (ⓦ) | “We WON” | **2.2%** reflection + **0.8%** team |
| **MEME** | — | **1%** reflection + **1%** burn |
| **GRAMS** | — | *Section heading exists on Notion; detailed breakdown was in a collapsed/embedded block not fully captured here.* |

---

## Getting started (checklist-style summary)

**Audience:** Everyone  
**Difficulty:** Easy (~15 minutes suggested)

1. **Wallet** — Get a [WebAuth wallet](https://webauth.com/getStarted) and fund it (e.g. via KuCoin), or complete **KYC** for in-app bridging.
2. **On-ramp** — KYC to bring in **USDC**, **BTC**, etc.; bank options mentioned for **US**, **Canada**, **Australia**.
3. **Swap** into a Flex token (examples from the page — canonical Alcor web paths use **`/v/xpr/`** on `alcor.exchange`):
   - [EASY-mon3y](https://alcor.exchange/v/xpr/swap?input=XUSDC-xtokens&output=EASY-mon3y)
   - [WON-w3won](https://alcor.exchange/v/xpr/swap?input=XUSDC-xtokens&output=WON-w3won)
   - [MEME-m3m3](https://alcor.exchange/v/xpr/swap?input=XUSDC-xtokens&output=MEME-m3m3)
   - Example **token analytics** (volume / depth): [EASY-mon3y](https://alcor.exchange/v/xpr/analytics/tokens/easy-mon3y)
4. **Optional — choose reward token** via contract actions (see [Contracts & explorer actions](#contracts--explorer-actions)).

---

## Contracts & explorer actions

Reward selection and related calls are done through XPR Network contracts. The Notion page links to **explorer** tabs with **Actions** pre-filtered.

### EASY / MEME-style (`mon3y`, `m3m3`)

| Action | Purpose (from page) | Example explorer link pattern |
|--------|---------------------|-------------------------------|
| `setflextoken` | Choose your reward token | [mon3y — setflextoken](https://explorer.xprnetwork.org/account/mon3y?loadContract=true&tab=actions&account=mon3y&scope=mon3y&limit=100&table=flexpools&action=setflextoken), [m3m3 — setflextoken](https://explorer.xprnetwork.org/account/m3m3?loadContract=true&tab=actions&account=m3m3&scope=m3m3&limit=100&action=setflextoken) |
| `distribute` | Pay people / run distribution | [mon3y — distribute](https://explorer.xprnetwork.org/account/mon3y?loadContract=true&tab=Actions&account=m3m3&scope=m3m3&limit=100&action=distribute), [m3m3 — distribute](https://explorer.xprnetwork.org/account/m3m3?loadContract=true&tab=actions&account=m3m3&scope=m3m3&limit=100&action=distribute) |
| `noflexzone` | **Opt out** of fees (+ rewards); **one-way** — cannot opt back in for rewards on that account | [mon3y — noflexzone](https://explorer.xprnetwork.org/account/mon3y?loadContract=true&tab=Actions&account=m3m3&scope=m3m3&limit=100&action=noflexzone) |

> The page mixes `account`/`scope` query params in some URLs; **verify** the correct contract/account on [XPR Network Explorer](https://explorer.xprnetwork.org/) before signing.

### WON (`w3won`)

| Action | Purpose (from page) | Example link |
|--------|---------------------|--------------|
| `sprouttoken` | Choose reward token | [w3won — sprouttoken](https://explorer.xprnetwork.org/account/w3won?loadContract=true&tab=actions&account=w3won&scope=w3won&limit=100&action=sprouttoken) |
| `radiate` | Related to distribution flow (paired with “distribute” in the doc) | [w3won explorer](https://explorer.xprnetwork.org/account/w3won?loadContract=true&tab=actions&account=w3won&scope=w3won&limit=100) *(confirm action name in UI)* |
| `optoutoftax` | Opt out of tax (and rewards); treat as **irreversible** for rewards on that account | [w3won — optoutoftax](https://explorer.xprnetwork.org/account/w3won?loadContract=true&tab=actions&account=w3won&scope=w3won&limit=100&action=optoutoftax) |

### Changing reward token (instructions from page)

- Use **`setflextoken`** on `mon3y` / **`sprouttoken`** on `w3won`.
- Enter the **desired token symbol** (capital letters as required by the contract).