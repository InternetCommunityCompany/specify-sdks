# Specify SDK core

`@specify-sh/core` contains the shared implementation used by Specify SDK packages. Most publishers should install a product SDK such as `@specify-sh/publisher-sdk` instead.

The package exports:

- `Address`, `ImageFormat`, and `SpecifyAd`
- `ValidationError`
- `MAX_WALLET_ADDRESSES`
- `assertValidAddresses()`, `assertValidPublisherKey()`, and `prepareWalletAddresses()`
- `AdRequest` and `requestAd()`

The validation helpers enforce the publisher-key and wallet-address formats used by Specify SDKs. `prepareWalletAddresses()` also deduplicates wallet addresses and enforces the 50-address limit. `requestAd()` implements the shared `/v1/ads` request and response handling.

Browser consent, identity state, and browser storage are owned by the browser SDK and are not part of this package.
