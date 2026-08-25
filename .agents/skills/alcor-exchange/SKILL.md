---
name: alcor-exchange
description: >-
  Guides integration with Alcor Exchange on EOSIO chains (including XPR): swap.alcor memos,
  orderbook contract alcor. Always prefer new web URLs https://alcor.exchange/v/xpr/* and
  /v/wax/* when linking or embedding; programmatic REST/WebSocket uses proton/wax/etc. subdomains.
  EOS and Telos web UI stays eos.alcor.exchange / telos.alcor.exchange only (no /v/eos/ or /v/telos/).
  Use for Alcor—not MetalX dex APIs.
---

# Alcor Exchange (skill/)

## When to use

- Building **AMM swaps** via **`swap.alcor`** transfer memos (`swapexactin` / `swapexactout`).
- **Orderbook** flows against the chain’s Alcor DEX account (**`alcor`** on Proton).
- **User-facing links / iframes:** **prefer** **`https://alcor.exchange/v/xpr/...`** (this repo) or **`/v/wax/...`** for WAX—see **`skill/alcor-widgets-ecosystem.md`**. Use legacy **`*.alcor.exchange`** only when **`/v/...`** is missing or you must match an old URL.
- **`fetch` / Socket.IO:** **`https://proton.alcor.exchange`** and **`wss://proton.alcor.exchange/socket.io/`** for XPR data (never bare **`alcor.exchange/api`** for Proton JSON—it redirects to WAX).

Use **[`skill/metalx-dex.md`](../../../skill/metalx-dex.md)** and **`skill/defi-trading.md`** for MetalX **`dex`** + **`dex.api.mainnet.metalx.com`**.

## Instructions

1. Open **[`skill/alcor-dex.md`](../../../skill/alcor-dex.md)** (upstream ABI/API guide from xpr-network-dev-skill).
2. Open **[`skill/alcor-exchange.md`](../../../skill/alcor-exchange.md)** for the local `/v/xpr/` module index.
3. Follow the linked topic files from that index (overview, orderbook, swap/AMM, API/realtime, widgets/ecosystem).
4. Confirm contract names, memos, and ABIs on **[explorer.xprnetwork.org](https://explorer.xprnetwork.org/)** before mainnet. **`reward.alcor`** on XPR has **no published swap ABI**—farm logic is on **`swap.alcor`**.

## Related modules

| Topic | File |
|--------|------|
| Upstream Alcor DEX | [`skill/alcor-dex.md`](../../../skill/alcor-dex.md) |
| Local `/v/xpr/` index | [`skill/alcor-exchange.md`](../../../skill/alcor-exchange.md) |
| Alcor overview / UI / fees | [`skill/alcor-overview-ui.md`](../../../skill/alcor-overview-ui.md) |
| Alcor orderbook | [`skill/alcor-orderbook.md`](../../../skill/alcor-orderbook.md) |
| Alcor AMM + TWAP | [`skill/alcor-swap-amm.md`](../../../skill/alcor-swap-amm.md) |
| Alcor REST + WebSocket | [`skill/alcor-api-realtime.md`](../../../skill/alcor-api-realtime.md) |
| Widgets, farms, `/v/` routes | [`skill/alcor-widgets-ecosystem.md`](../../../skill/alcor-widgets-ecosystem.md) |
| Metal X DEX API | [`skill/metalx-dex.md`](../../../skill/metalx-dex.md) |
| SimpleDEX | [`skill/simpledex.md`](../../../skill/simpledex.md) |
