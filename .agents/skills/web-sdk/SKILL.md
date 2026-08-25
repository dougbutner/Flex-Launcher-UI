---
name: web-sdk
description: >-
  Guides @proton/web-sdk and @proton/link wallet connect on XPR: WebAuth mobile/browser,
  session restore, transact, and Anchor via WharfKit. Use when connecting wallets, signing
  actions in the Vite app, or changing src/services wallet code.
---

# Web SDK / wallets (XPR)

## When to use

- Login, session restore, or `transact` in this template’s **`src/`** app.
- Mobile WebAuth deep links (`@proton/link`) or browser WebAuth.
- Anchor / WharfKit session flows.

## Instructions

1. Follow **[`skill/web-sdk.md`](../../../skill/web-sdk.md)** for `@proton/web-sdk` + `@proton/link`.
2. For profiles / identity tables, see **[`skill/webauth-identity.md`](../../../skill/webauth-identity.md)**.
3. Match this repo’s patterns in **`src/services/`** and **`src/hooks/useProton.ts`**; set chain + app name in **`walletConstants.ts`**.
4. Prefer dynamic `import()` of the SDK so mobile transport registers before connect.

## Related

| Topic | File |
|--------|------|
| Accounts / permissions | [`skill/accounts-permissions.md`](../../../skill/accounts-permissions.md) |
| RPC after login | [`skill/rpc-queries.md`](../../../skill/rpc-queries.md) |
