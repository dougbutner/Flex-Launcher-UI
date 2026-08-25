---
name: smart-contracts
description: >-
  Guides XPR Network (EOSIO) smart contract development with proton-tsc / proton-asc: tables, actions, build, deploy, and safety.
  Use when writing, reviewing, or deploying on-chain contracts, or when the user mentions WASM, ABIs, contract tables, or `proton` CLI for contracts.
---

# Smart contracts (XPR Network)

## When to use

- Creating or changing **on-chain** code (`.contract.ts`, tables, actions, deploy), not the Vite app in `src/` unless wiring to a contract.
- Reviewing whether a table or deploy step is safe.

## Instructions

1. Open and follow **[`skill/smart-contracts.md`](../../../skill/smart-contracts.md)** in this repository for patterns, tooling, and examples.
2. Before altering live contracts or tables, read **[`skill/safety-guidelines.md`](../../../skill/safety-guidelines.md)**. Never change an existing deployed table schema that already holds rows.
3. Prefer **testnet** first; treat mainnet deploy and fund-moving actions as high risk.

## Related modules

| Topic | File |
|--------|------|
| Testing / debugging | [`skill/testing-debugging.md`](../../../skill/testing-debugging.md) |
| CLI (deploy, queries) | [`skill/cli-reference.md`](../../../skill/cli-reference.md) |
