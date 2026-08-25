# AI builder guide — conventions for this project

This document is for **human developers** and **AI coding agents** working in this repository. Follow it so new work stays consistent with the product direction and with the NFT ecosystem choices already committed for this environment.

---

## 1. Purpose

- Keep **UI, copy, and architecture** aligned with the existing **XPR Network multi-login** template (WebAuth + Anchor, multi-account header, transaction patterns).
- Treat the linked **WAX NFT metadata standards** and **Loot staking contract** as **mandatory references** whenever the work involves NFTs, metadata schemas, or NFT staking—not optional alternatives.

---

## 2. Visual and UX style (this codebase)

When extending the app, match what is already here unless the product owner explicitly changes direction:

- **Theme:** Dark **black-and-gold** palette. Primary = rich gold; **accent** = lighter gold for highlights, focus rings, and hovers. Avoid reintroducing the old purple accent.
- **Stack:** React, Vite, Tailwind, shadcn-style UI primitives (`src/components/ui/`).
- **Wallets:** Respect multi-account flows (`Header`, wallet manifest, WebAuth + Anchor). Do not simplify to a single-account-only model without explicit approval.
- **Copy:** Prefer clear, builder-focused language; keep **EASY** / **Flextokens** / XPR positioning consistent with `src/pages/Index.tsx` and `flex-tokens.md` where relevant.

---

## 3. NFT metadata — required standard

**All NFTs in this environment should follow the WAX NFT Metadata Standards** maintained by currentxchange:

- **Repository:** [github.com/currentxchange/WAX-NFT-Metadata-Standards](https://github.com/currentxchange/WAX-NFT-Metadata-Standards)
- **Published docs:** [standards.cxc.world](https://standards.cxc.world) (see `media/` for literature, video, image, photo, music, etc.)
- **Schema tooling:** The standards README points to [tools.cXc.world](https://tools.cxc.world) for UI-driven schema creation.

### What to enforce in implementation and reviews

- Schemas should be **Atomic Assets–compatible** and use the **field sets** defined in that repo (e.g. `name`, `img`, `artist`, `title`, `about`, `backimg`, `collectionimg`, genre/mood/format, credits, link, promo, license, labels, rarity; plus **Web4 / spacetime** fields when location or time metadata is needed).
- Supported media categories called out in the standard include **Image, Photo, Literature, Music, Video** (see repo README / published site).
- For **music** specifically, the repo links to [currentxchange/Music-NFT-Standard](https://github.com/currentxchange/Music-NFT-Standard) as the deeper music standard.
- Prefer **copy-paste schema fragments** from the standards repo or the published GitBook-style pages rather than inventing one-off field names that will not render cleanly on major WAX markets (AtomicHub, NFThive, WAXdao, etc.).

If a feature needs “an NFT schema,” the default answer is: **start from WAX-NFT-Metadata-Standards and document any intentional deviation.**

---

## 4. NFT staking — required reference implementation

**Staking for NFTs should be understood and, where applicable, integrated in line with the Loot contract** (WAX, AtomicAssets):

- **Repository:** [github.com/currentxchange/loot](https://github.com/currentxchange/loot)  
- **Docs (cXc):** [docs.cxc.world/loot](https://docs.cxc.world/loot) (referenced from the repo README)

### High-level behavior (from project README — verify in repo before mainnet use)

- **Collection owners:** register users, register collections (`setnftcolrew`), add eligible templates (`addtemplates`), **fund** the contract with reward tokens (memo with collection name to establish a reward **bank**), optionally tune templates (`rmtemplates`).
- **Holders:** register (optionally with **referrer** for referral score), **transfer NFTs to the contract** to stake, **claim** by collection (not per asset ID), **unstake** with `unstake` (claim before unstaking—unstake does not auto-claim).
- **Multipliers:** Referral-based and “HODL” / stake-count multipliers; both multiply together—**reward rates should start very small** if multipliers are non-zero. Owners can disable multiplier paths by setting coefficients to **0** in `setconfig`.
- **Leveled rewards:** Integer series (Fibonacci, Silver, Tetrahedral, etc.) in `integer-series.hpp`; `setconfig` selects the series type.

### Actions to know (end-user and owner surface)

| Action | Role |
|--------|------|
| `regnewuser` | Register; optional `referrer` |
| `claim` | Claim rewards for a `collection` |
| `unstake` | Unstake `asset_ids` (claim first) |
| `resetuser` | Reset own staking state (emergency-style) |
| `refund` | Refund flow (see README; **authorized collection accounts** can affect reward withdrawal—read warnings) |
| `setnftcolrew` | Owner: register collection, token, time unit, unstake period, referral/HODL series + coefficients |
| `addtemplates` / `rmtemplates` | Owner: add/remove stakeable `template_id` + `timeunit_rate` |

**Safety:** The Loot README warns that misunderstanding multipliers can **overpay**; the contract must stay **funded** or rewards stop; `refund` has **authorization caveats**. Always point builders at the upstream README and tests before production deployment.

---

## 5. How this relates to XPR in this repo

This application is primarily an **XPR Network** template (wallets, signing, Flextokens copy in the UI). **NFT metadata and staking conventions above are WAX / AtomicAssets–centric** by explicit product choice. When building cross-chain or WAX-specific features:

- Do not substitute a different metadata standard without stakeholder approval.
- Bridge concepts in docs (e.g. “metadata follows WAX-NFT-Metadata-Standards; chain actions may differ on XPR”) so future agents are not confused.

---

## 6. Related project docs

- **`flex-tokens.md`** — Flex tokens (EASY, WON, MEME, GRAMS) on XPR; contracts and links.
- **`Welcome.md`** — Onboarding conversation for new sessions; what to ask the user before large builds.

---

*Keep this file updated when standards or staking integration decisions change.*
