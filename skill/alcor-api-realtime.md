# Alcor — HTTP API & WebSocket (Socket.IO)

Part of the **[Alcor skill split](alcor-exchange.md)**. **Writes** (orders, swap transfers) → chain RPC + wallet—not these REST routes.

UI links: prefer **`https://alcor.exchange/v/<slug>/...`** for **`xpr`**/**`wax`** ([alcor-widgets-ecosystem.md](alcor-widgets-ecosystem.md)). Below: **`fetch`/Socket hosts**; JSON not under **`/v/...`**.

## HTTP API

Reference: **[api.alcor.exchange](https://api.alcor.exchange/)**.

### Hosts (`<chain>.alcor.exchange/api`)

```text
https://<chain-subdomain>.alcor.exchange/api
```

| Chain | Subdomain | Example |
|-------|-----------|---------|
| WAX | `wax` | `GET https://wax.alcor.exchange/api/markets` |
| Proton / XPR | **`proton`** | `GET https://proton.alcor.exchange/api/markets` |
| Telos | `telos` | `GET https://telos.alcor.exchange/api/markets` |

**EOS:** **`https://alcor.exchange/api/markets`** **301** → **`wax.alcor.exchange`**—don’t assume bare host = EOS/Proton; pick subdomain. **EOS/Telos UI links:** **`eos.alcor.exchange`**, **`telos.alcor.exchange`** only—not **`alcor.exchange/v/eos/...`** ([alcor-widgets-ecosystem.md](alcor-widgets-ecosystem.md)).

### XPR examples

- `GET https://proton.alcor.exchange/api/markets` — `chain` **`"proton"`**
- `GET https://proton.alcor.exchange/api/markets/:id`
- `GET .../markets/:id/deals` — `limit`, default 200
- `GET .../markets/:id/charts` — `to`, `from`, `resolution` (`1/5/15/30/60/240`, `1D`/`1W`/`1M`)
- `GET .../api/account/:name/deals` — `market`, `limit`, `skip`
- `GET .../api/account/:name/liquidity_positions`

### Backups UI

**[https://alcor.exchange/v/xpr/backups](https://alcor.exchange/v/xpr/backups)**

## WebSocket

Same origin as REST, e.g. **`wss://proton.alcor.exchange/socket.io/`** (WAX: **`wss://wax.alcor.exchange/socket.io/`**).

`subscribe` / `unsubscribe` — `{ room, params }`.

| Room | Params | Purpose |
|------|--------|---------|
| `deals` | `chain`, `market` | Trades (~200 first payload) |
| `ticker` | `chain`, `market`, `resolution` | Chart ticker |
| `account` | `chain`, `name` | Account events |
| `orderbook` | `chain`, `market`, `side` (`buy`/`sell`) | Book + deltas |

Proton: **`params.chain`** = **`"proton"`** (not `xpr`).

**Events:** `match`, `orderbook_sell`, `orderbook_buy`, `new_deals` ([docs](https://docs.alcor.exchange/)).

```js
import { io } from 'socket.io-client'

const socket = io('https://proton.alcor.exchange')
socket.emit('subscribe', {
  room: 'deals',
  params: { chain: 'proton', market: 279 },
})
socket.on('new_deals', deals => {
  /* ... */
})
```

Don’t assume **`io('https://alcor.exchange')`** hits the right hub—verify.
