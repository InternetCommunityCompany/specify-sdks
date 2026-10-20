---
"@specify-sh/core": patch
"@specify-sh/publisher-sdk": patch
---

Wallet addresses that differ only in letter case, such as a checksummed address and its lowercase form, now count as one wallet everywhere, including `serve()` from `@specify-sh/publisher-sdk/server`. Such a wallet is sent once and counts once toward the 50-address limit. Registering a case variant of an address already passed to `identify()` no longer runs the `onIdentityChange` listeners.
