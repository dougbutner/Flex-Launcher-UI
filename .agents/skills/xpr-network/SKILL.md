---
name: xpr-network
description: >-
  Index of XPR Network / EOSIO reference markdown in skill/ (synced from
  XPRNetwork/xpr-network-dev-skill v2.3.2): wallets, RPC, contracts, NFTs, oracles,
  CLI, DeFi. Use when building on XPR, unsure which skill/ module applies, or when
  the task spans wallets, chain reads, and on-chain state.
---

# XPR Network (`skill/` index)

## Instructions

1. Open **[`skill/SKILL.md`](../../../skill/SKILL.md)** (upstream routing table + AI-agent signing policy).
2. Then open the matching topic file under **`skill/`** (do not invent chain APIs from memory).
3. For **on-chain contracts**, prefer the **`smart-contracts`** skill and **`skill/safety-guidelines.md`** (testnet first).
4. For **Alcor DEX/AMM**, prefer the **`alcor-exchange`** skill — not MetalX.
5. Local-only extras (flextokens, Alcor `/v/xpr/` split) are listed at the bottom of **`skill/SKILL.md`** and in **[`skill/README.md`](../../../skill/README.md)**.

## Quick map

| Need | Start here |
|------|------------|
| Wallet / `@proton/web-sdk` | [`skill/web-sdk.md`](../../../skill/web-sdk.md), [`skill/webauth-identity.md`](../../../skill/webauth-identity.md) |
| RPC / table reads | [`skill/rpc-queries.md`](../../../skill/rpc-queries.md) |
| Contracts / deploy | **`smart-contracts`** skill → [`skill/smart-contracts.md`](../../../skill/smart-contracts.md) |
| NFTs / AtomicAssets | [`skill/nfts-atomicassets.md`](../../../skill/nfts-atomicassets.md) |
| Randomness / oracles | [`skill/oracles-randomness.md`](../../../skill/oracles-randomness.md) |
| Alcor swap / orderbook | **`alcor-exchange`** skill → [`skill/alcor-dex.md`](../../../skill/alcor-dex.md) |
| Safety | [`skill/safety-guidelines.md`](../../../skill/safety-guidelines.md) |

App UI and wallet wiring live in **`src/`** and **`src/services/walletConstants.ts`** — keep those intact unless fixing a wallet bug.
