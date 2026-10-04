---
name: user-facing-copy
description: >-
  Keeps end-user UI copy free of internal, technical notes. Use when writing or
  editing labels, hints, info text, empty states, errors, buttons, or any string
  a person sees in the Flex launcher. Internal, techy copy is NEVER shown to an
  end user.
---

# User-facing copy

Internal, techy copy is NEVER shown to an end user.

A person using the app sees what they can do and what will happen. They do not see how the screen was built.

## Never show

- How a list was assembled, filtered, snapshotted, or saved
- API, RPC, indexer, or host names (Light API, EOSUSA, Hyperion)
- Table names, scope rules, caps, and fallback paths (`flexers`, `stat`, row caps)
- Dollar cutoffs, repo files, or "that list is saved"
- Why an engineer chose a data source

Code comments, skills, and agent notes can keep that detail. Strings rendered in the UI cannot.

## Write instead

Say the outcome in plain words. One sentence. No plumbing.

Bad: `X tokens, plus tokens with over $100 of XPR in an Alcor pool. That list is saved.`

Good: `Holders of this token receive the drop.`

Bad: `Holder ranks come from the Light API, because EOSUSA does not publish that list.`

Good: `If signing fails because the account is out of CPU or NET, stake more resources.`

Chain facts the person must act on can stay: RAM they pay, tax on the send, memo limits, account names they might type. The path used to read those facts stays hidden.
