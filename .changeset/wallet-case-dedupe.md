---
"@specify-sh/core": patch
"@specify-sh/publisher-sdk": patch
---

Wallet addresses that differ only in letter case, such as a checksummed address and its lowercase form, now count as one wallet in `serve()` from `@specify-sh/publisher-sdk/server`. The wallet is sent once, in the casing you passed first, and counts once toward the 50-address limit, matching what the browser client already sent. In the browser, `serve(addresses, options)` no longer throws `ValidationError` for a list that goes over 50 only because of such duplicates.
