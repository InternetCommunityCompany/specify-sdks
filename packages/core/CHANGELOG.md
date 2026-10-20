# @specify-sh/core

## 0.2.0

### Minor Changes

- f03d6e8: Addresses that aren't EVM wallet addresses, such as Solana addresses, are now skipped instead of failing the call, so a site that passes wallets from several chains still gets an ad. This covers `serve()` and `identify()` in the browser, `useSpecifyAd`, and `serve()` from `@specify-sh/publisher-sdk/server`. None of them throws `ValidationError` for an address any more. The server `serve()` returns `null` when none of the addresses it was given is an EVM wallet address.
  
  `serve()` given more than 50 different addresses now sends the first 50 instead of throwing.

### Patch Changes

- 6dbe35d: A missing or non-string publisher key now throws `ValidationError`, like a malformed one, instead of a `TypeError`.
- 8639db8: Types now resolve in projects that use `"moduleResolution": "NodeNext"`. Before, some types in those projects, such as `ValidationError`, resolved to `any`, so TypeScript couldn't narrow a caught error with `instanceof ValidationError`.
  
  The server entries' types no longer need the DOM library, so a Node project with `lib: ["ES2022"]` type-checks without `skipLibCheck`.
- f03d6e8: Wallet addresses that differ only in letter case, such as a checksummed address and its lowercase form, now count as one wallet everywhere, including `serve()` from `@specify-sh/publisher-sdk/server`. Such a wallet is sent once and counts once toward the 50-address limit. Registering a case variant of an address already passed to `identify()` no longer runs the `onIdentityChange` listeners.

## 0.1.0

### Minor Changes

- 716c30f: Publish the shared SDK core as a public package with JavaScript and TypeScript declarations. The publisher SDK now consumes core as a normal runtime dependency instead of copying its implementation into the publisher package.
