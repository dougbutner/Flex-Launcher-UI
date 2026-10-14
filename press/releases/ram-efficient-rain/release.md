# If you call the rain, one swapped payout is the stop

You open Make it Rain. A token has money sitting there for holders. You sign once.

If the next payout has to be swapped into another coin, that signature does one swap. When the call reaches another holder who also needs a swap, it stops. The money it did not send is back in the pool. The next call can pay it.

You still pay RAM for a new holder row that this call opens. You are not asked to open a row for every later swapped payout in that same signature.

This is on the three Flex contracts: 3asy, fl3x, and for3x. Holders who are paid in the token itself do not burn that one swap. A holder who chose another coin does. The first of those swaps is sent. The second one ends the call.

38.2% of the reflection pool is what a rain call sets aside to pay. Whatever this call does not hand out stays in that pool.

## What you do

1. Open https://flex.forex/reflections
2. Connect the wallet that will sign
3. Call the rain on a token that has something to pay

If a holder needs another coin, expect one swap in that signature. Call again when you want the rest paid.

## Needed from you

- A measured RAM difference, in bytes or in XPR, on a real token before and after this stop. This page does not claim a percent.
- Confirm the copy now on 3asy, fl3x, and for3x is this build. The stop is in the contract source. Deployment is not checked here.
