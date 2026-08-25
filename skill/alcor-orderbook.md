# Alcor — orderbook DEX (on-chain)

Part of the **[Alcor skill split](alcor-exchange.md)**. Confirms current ABI/memos on-chain before mainnet.

Books on-chain—wallet, **cleos**, explorers (e.g. bloks.io).

## Contracts by chain

| Chain | Account |
|-------|---------|
| EOS | `eostokensdex` |
| Telos | `eostokensdex` |
| WAX | `alcordexmain` |
| BOS | `alcordexmain` |
| Proton (XPR) | `alcor` |

## Tables (XPR `alcor` ABI)

**`markets`**, **`buyorder`**, **`sellorder`**, **`account`**, **`ban`**, **`freeorders`**, **`settings`**. Scope **`buyorder`/`sellorder`** often = **market id**.

## Market row (conceptual)

`id`, `base_token`/`quote_token` **`extended_symbol`**, `min_buy`/`min_sell`, `frozen`, `fee`, indexes (`bytokens`, 256-bit keys—docs + [make256key JS](https://github.com/avral/alcor-ui/blob/7bd8483435c26bc3cdd1017d8f6efe1f5b0fe6e2/utils/index.js#L28)).

## Memos / actions

**New market** — transfer to chain DEX account:

```text
new_market|0.00000000 WEED@weedcashnt
```

**`to`** = table above.

**Order** — transfer **bid** to DEX; memo = **ask** extended asset:

```text
1000.0000 TKT@eossanguotkt
```

**Cancel:** `cancelsell` / `cancelbuy` — `executor`, `market_id`, `order_id`.

## RPC

Docs: eosjs **`transfer`** + **`get_table_rows`** on **`buyorder`**, `scope: marketId`, `index_position`, `key_type: 'i128'`. **Verify** live ABI.
