# Alcor Swap (AMM) — `swap.alcor`

Part of the **[Alcor skill split](alcor-exchange.md)**. Same contract account on all supported chains: **`swap.alcor`**.

## Memos

- **`swapexactin`** — spend full input, max output.
- **`swapexactout`** — spend input until **exact** output, return change.

```text
<swapexactin|swapexactout>#<poolIds>#<recipient>#<Output extended asset>#<deadline>[#market.account]
```

Example:

```text
swapexactin#0#alcordexfund#3.9167 TLM@alien.worlds#0
```

Trailing **`#market.contract`** = custom/referral fee. Params: mode, pool path (comma multi-hop), recipient, output string, deadline (sec), optional market.

Sqrt math in docs—apps: **[alcor-v2-sdk](https://github.com/alcorexchange/alcor-v2-sdk)**.

**Gists:** Pool X/Y price [gist](https://gist.github.com/avral/239e31232eb9a173b77c56dc537ddb6d); liquidity by wallet [gist](https://gist.github.com/avral/43a6dacbad1f3db3fe3b0e56b53ba7e7).

## `pools` (ABI)

**`swap.alcor`** **`pools`**: CL rows—**`id`**, **`tokenA`/`tokenB`** **`extended_asset`**, **`fee`**, **`tickSpacing`**, **`currSlot`** (sqrt/tick/oracle), **`liquidity`**, protocol fees, … Older “pairs” wording—**confirm ABI**.

Farm tables **`incentives`**, **`stakes`**, **`stakingpos`** — full list [alcor-exchange.md](alcor-exchange.md).

## Referral / market fee

1. **`regmarket`** on `swap.alcor`: `marketName` (fee receiver), `marketFee` per **10⁶** (`1000`=0.1%, `500`=0.05%; max `10000`=1%). Docs example: WAX bloks.
2. Deep link: **`https://alcor.exchange/v/xpr/swap?market=<marketAccount>`** (slug **`xpr`**).
3. Iframe: same **`market`** on **`https://alcor.exchange/v/xpr/swap-widget`** ([alcor-widgets-ecosystem.md](alcor-widgets-ecosystem.md)).
4. Memo suffix **`#<marketAccount>`**.

## Concentrated liquidity

- Fee tiers ~**0.05%–1%** (docs).
- Range LP; out of band → **100% one asset**, **no fees** until back in range.
- Permanent lock: transfer position → **`eosio.null`**.
- Narrow/widen = close + reopen (docs).

## TWAP oracles

Rolling observations (V3-like); use window not spot. Extend history: RAM transfer WAX → `swap.alcor`, memo **`addoraclerow#<poolId>`** (WAX example in docs). vs Delphi: on-chain DEX vs CEX agg. Helper: **[alcor-oracle-price](https://github.com/alcorexchange/alcor-oracle-price)** (`getPriceTwapX64`, …).
