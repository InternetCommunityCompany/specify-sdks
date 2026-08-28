---
"@specify-sh/publisher-sdk": minor
---

Add an options-only form of `serve()` and an `identify()` method to the publisher SDK. `serve({ imageFormat })` serves using the wallets registered through `identify()` and the consent signal, while the existing `serve(addressOrAddresses, options)` form is unchanged. `identify()` registers wallet addresses that ride along on every later `serve()`: it merges and never removes, keeps the 50 most recent registrations, and does nothing outside a browser.
