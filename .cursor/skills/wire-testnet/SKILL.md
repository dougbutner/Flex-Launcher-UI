---
name: wire-testnet
description: Deploy and operate Antelope contracts on Wire Network testnet (sysio, ROA, Alcor Wire RPC). Use when launching Flex tokens on Wire testnet, using clio/sysio, wiretest-api.alcor.exchange, or when eosio-named APIs fail on Wire.
---

# Wire Network testnet

Copied from Flex-Forex. Wire is a [Spring/Antelope fork](https://github.com/Wire-Network/wire-sysio). Privileged account is **`sysio`**, not `eosio`. Tokens on **`sysio.token`**. Resources are **ROA**, not `buyram`.

Compile/deploy scripts live in the **Flex-Forex** repo (`testnet/compile-wire.py`, `testnet/deploy-contract.mjs`), not this UI repo.

Official docs: [Network information](https://docs.wire.network/docs/introduction/network-information), [ROA](https://docs.wire.network/docs/api-reference/system-contracts/contracts/sysio.roa), [Hub](https://docs.wire.network/docs/wire-hub/create-wire-testnet-account).

## Two testnets (do not mix)

| | Alcor Wire testnet | Official Wire Foundation testnet |
|---|---|---|
| RPC | `https://wiretest-api.alcor.exchange` | `https://testnet-00.wire.foundation/` |
| chain_id | `cf4381bcea94e79b2cbb630ca1edd59108b1d159637b2cee7c51d45cdca9c0a7` | confirm `get_info` |
| `swap.alcor` | **present** | do not assume |

Always `POST /v1/chain/get_info` and check `chain_id`. Alcor RPC **403s** clients with no User-Agent; send `cleos/2.0` or similar.

## Tooling

- Wire CLI is **`clio`**. Stock **`cleos` cannot unpack `sysio::abi/1.2`**.
- No `eosio` account. Core token **SYS** on `sysio.token`.
- `xtokens`, `mon3y`, `eosio.token` often **absent** — flex quotes / xtoken proofs will fail until those exist.
- UI env for this chain (from AGENTS.md): flexforex `gudsol.ksxla`, easyflex `gudsol.rxkks`, complexflex `gudsol.chlru`.

## Fallback

1. Alcor Wire testnet (this skill).
2. XPR testnet — chain_id `71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd`.
3. WAX testnet — confirm `get_info`.
