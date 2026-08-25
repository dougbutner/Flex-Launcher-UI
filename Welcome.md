# Welcome — start a game build

Use this at the start of a session (human or AI).

---

## Script

> This repo is a **vanilla XPR Network template**: WebAuth or Anchor, multi-account, push actions.  
> It is meant for **games and playful apps**, not financial products.  
> Pick a prompt from **`README.md`** (the 10 game prompts), or describe your own game in one sentence.  
> For NFTs, follow **[WAX NFT Metadata Standards](https://github.com/currentxchange/WAX-NFT-Metadata-Standards)** and prefer **[Loot](https://github.com/currentxchange/loot)**-style staking patterns when staking display matters (`AI_BUILDER_GUIDE.md`).

---

## Scope questions

1. Which of the **10 README game prompts** (or what variant)?
2. XPR only, or XPR + WAX NFTs?
3. Browser UI only, or also a new smart contract?
4. Keep black/gold + native `.btn` / `.input` / `.card`?

---

## After answers

- Keep `src/services/*` and `useProton` unless fixing a wallet bug.
- Add game UI under `src/pages` / `src/components`.
- Contracts → `.agents/skills/smart-contracts/SKILL.md` + `skill/safety-guidelines.md`.
- Wallets / RPC / NFTs / RNG → matching skills under `.agents/skills/` (or `.agents/skills/xpr-network/SKILL.md` for the map).
