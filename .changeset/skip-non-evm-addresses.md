---
"@specify-sh/core": minor
"@specify-sh/publisher-sdk": minor
---

Addresses that aren't EVM wallet addresses, such as Solana addresses, are now skipped instead of failing the call, so a site that passes wallets from several chains still gets an ad. This covers `serve()` and `identify()` in the browser, `useSpecifyAd`, and `serve()` from `@specify-sh/publisher-sdk/server`. None of them throws `ValidationError` for an address any more. The server `serve()` returns `null` when none of the addresses it was given is an EVM wallet address.

`serve()` given more than 50 different addresses now sends the first 50 instead of throwing.
