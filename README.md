# XPR App Forge

A **vanilla** Vite + React + TypeScript starter for **XPR Network** apps: **WebAuth** + **Anchor**, multi-account header, one active signer, and a plain **contract action** form. No UI kit, no query layer, no Radix/shadcn—native HTML and a few Tailwind classes.

Use it as a **copy template** for games and playful on-chain apps. Wallet code stays; you replace the page.

---

## What you get

- Connect **WebAuth** (browser / mobile) via [`@proton/web-sdk`](https://docs.xprnetwork.org/client-sdks/web.html) + `@proton/link`, or **Anchor** via WharfKit
- Remember several wallets, switch the active signer, sign with `useProton().transact`
- Black / gold theme tokens in `src/index.css` (`.btn`, `.input`, `.card`)
- `skill/` markdown for contracts, RPC, NFTs, testing; Cursor Agent Skills under `.agents/skills/` (thin wrappers → `skill/`)

Not included on purpose: DeFi dashboards, swaps, portfolios, or financial-product scaffolding.

---

## Stack (minimal)

| Layer | Choice |
|--------|--------|
| Build | Vite 5 |
| UI | React 18 + Tailwind utilities |
| Wallets | `@proton/web-sdk`, `@proton/link`, WharfKit session + Anchor plugin |
| Routing | `react-router-dom` (`/`, 404) |
| Tests | Vitest (smoke) |

---

## Layout

```text
src/
  App.tsx                 # Router + Wharf dialog mount
  main.tsx
  index.css               # Theme + .btn / .input / .card
  components/
    Header.tsx            # Multi-wallet menu (native <details>)
    TransactionForm.tsx   # Contract / action / JSON → transact
  hooks/useProton.ts
  pages/Index.tsx         # Home
  pages/NotFound.tsx
  services/               # Wallet restore, WebAuth, Anchor, constants
skill/                    # XPR / EOSIO reference markdown (not Agent Skills)
.agents/skills/           # Cursor skills: xpr-network, web-sdk, rpc-queries, …
```

---

## Commands

```bash
npm install
npm run dev      # http://localhost:8080
npm run build
npm run preview
npm run test
```

Chain endpoints and app name: `src/services/walletConstants.ts`.

---

## How to build from this template

1. Copy the repo (or clone).
2. Paste one of the **10 game prompts** below into Cursor (or your AI) in this project.
3. Keep wallet services; change pages/components only as needed.
4. For on-chain contracts, follow `.agents/skills/smart-contracts/SKILL.md` and `skill/safety-guidelines.md`—**testnet first**.

---

## 10 game prompts

Copy a prompt as-is. Each stays **fun**, uses **real blockchain job** (identity, ownership, public state, signed moves), and **avoids financial services** (no trading, lending, staking-for-yield, swaps, or payment products).

### 1. On-chain rock–paper–scissors

> Build a two-player rock–paper–scissors game on this template. Players connect wallets; player A commits a hashed move on-chain (or via a simple contract table), player B plays, then A reveals. Show match status, winner, and rematch. Use `useProton` for connect/transact. Native HTML + existing Tailwind classes only—no new UI libraries. No token transfers or wagering.

### 2. High-score leaderboard (signed score submits)

> Add a casual endless or timed mini-game (e.g. click-target or snake-lite) in the browser. On game over, the signed-in account submits a `score` action to a contract table (design a minimal contract or mock with RPC read + optional testnet action). Show a global top-10 leaderboard from chain table rows. Wallet required only to submit. No payments, no prizes that look like financial rewards.

### 3. Turn-based dungeon room

> Create a tiny multiplayer dungeon: a room id, player positions on a grid, and a `move` action signed by the active wallet. Store state in a contract table (or local demo mode + clear “when contract exists” hooks). Spectators can open a room read-only via RPC. Keep UI one screen: map + move buttons + connected account. No loot-for-sale or marketplace.

### 4. Collectible sticker book (NFT inventory view)

> Build a sticker-book UI: after wallet connect, fetch AtomicAssets (or XPR NFT) inventory for the active account and show a grid of owned stickers with rarity labels. Add “place in album” as a local layout that can later call a stake-to-display action—document the action shape. Follow `AI_BUILDER_GUIDE.md` NFT metadata norms if minting is mentioned. No trading, auctions, or price charts.

### 5. Dice roll with on-chain commit

> Make a party dice app: user signs a `roll` (or commit/reveal) action; display the result and a history of the last 20 rolls for that account from a table. Prefer oracles/randomness patterns from `skill/oracles-randomness.md` if you add a contract. Fun UI: big die animation, then settle with tx id. No betting, no payouts.

### 6. Trivia night (host + players)

> Host creates a trivia session (session id on-chain or signed memo pattern); players join with their XPR account and submit answers as signed actions before a deadline. Show a scoreboard of accounts → points. Host reveals correct answers and final ranking. One page for host, one for player. No entry fees or prize pools.

### 7. Pixel canvas co-op

> Shared pixel canvas: each connected account can paint one pixel every N seconds by signing `paint(x,y,color)`. Load canvas state from a contract table (or chunked rows). Show cooldown based on last action for the active signer. Pure creative co-op—no selling pixels, no royalties UI.

### 8. Racing ghosts (replay your best run)

> Build a simple endless runner or lane-switcher. Save a “ghost” as a sequence of inputs tied to the account (store off-chain JSON keyed by actor, or compact on-chain blob if small). Race against your previous ghost or a friend’s ghost loaded by account name. Signing proves who owns the ghost record. No token rewards.

### 9. Guild / party invites

> Social game shell: create a party name, invite other XPR accounts by name, accept/decline with signed actions, show roster from a table. Add a “ready check” and a shared room code for a future game. Focus on identity and membership UX using multi-login in the header. No guild treasuries or tip jars.

### 10. Card battle (deck ownership + match log)

> Digital card duel: each player’s deck is a list of owned NFT template ids (read inventory) or a fixed starter deck for demo. Match flow: both sign `join_match`, then alternate `play_card` actions; write a match log table. UI: hand, board, end screen with tx links. Collectibles for play only—no marketplace, no card packs for sale.

---

## Docs map

| Doc | Purpose |
|-----|---------|
| [`skill/SKILL.md`](skill/SKILL.md) | Upstream XPR skill routing table (v2.3.2) |
| [`skill/README.md`](skill/README.md) | Local map + extras (Alcor `/v/xpr/`, flextokens) |
| [`.agents/skills/xpr-network/SKILL.md`](.agents/skills/xpr-network/SKILL.md) | Umbrella Agent Skill → which `skill/` to open |
| [`.agents/skills/smart-contracts/SKILL.md`](.agents/skills/smart-contracts/SKILL.md) | Contract build / deploy / safety |
| [`.agents/skills/web-sdk/SKILL.md`](.agents/skills/web-sdk/SKILL.md) | WebAuth / `@proton/web-sdk` wallets |
| [`.agents/skills/alcor-exchange/SKILL.md`](.agents/skills/alcor-exchange/SKILL.md) | Alcor DEX / AMM (not MetalX) |
| [`AI_BUILDER_GUIDE.md`](AI_BUILDER_GUIDE.md) | UI + NFT metadata conventions |
| [`Welcome.md`](Welcome.md) | First-session questions |
| [`parameters.md`](parameters.md) | Template goals & style constraints |

---

## Security

Signed actions can change real chain state. Review generated code, use **testnet**, and read `skill/safety-guidelines.md` before deploying contracts. Prefer narrow game actions over the generic JSON form in production.

---

## License

Dependencies keep their own licenses. Template positioning credits EASY / Flextokens ([flex.report](https://flex.report)).
