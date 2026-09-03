# @specify-sh/publisher-sdk

## 1.0.0

### Major Changes

- e2307f3: Release the publisher SDK as v1. `@specify-sh/sdk` is deprecated and this package replaces it.
  
  Breaking changes from v0.4.x:
  
  - `cacheMostRecentAddress` and the `localId` browser cache are gone. Specify's identity cookie replaces them and resolves across the network rather than one site.
  - `cookieConsent` is no longer a constructor option. `setCookieConsent()` is the only way to grant it.
  - `walletAddress` is no longer returned on `SpecifyAd`. After a cookie-only serve it could name a wallet the caller never sent.
  - `imageUrl` is typed `string | null`. It was `string` in v0.4.x even though a `NO_IMAGE` placement has no image.
  - `AuthenticationError`, `APIError` and `NotFoundError` are gone. `ValidationError` is the only error thrown, and it no longer carries `details`.
  - Importing the browser entry from a React Server Component now throws, directing the caller to `@specify-sh/publisher-sdk/server`.

### Minor Changes

- b381387: Add `setCookieConsent()` and `hasCookieConsent()` to the publisher SDK. `setCookieConsent()` is the only way to grant consent for Specify's identity cookie: a new instance starts without it, and the next `serve()` reflects a change without a reload. The setter does nothing outside a browser, so `cookieConsent` is no longer a constructor option — consent can only be granted where a browser exists.
- a471628: Add an options-only form of `serve()` and an `identify()` method to the publisher SDK. `serve({ imageFormat })` serves using the wallets registered through `identify()` and the consent signal, while the existing `serve(addressOrAddresses, options)` form is unchanged. `identify()` registers wallet addresses that ride along on every later `serve()`: it merges and never removes, keeps the 50 most recent registrations, and does nothing outside a browser.
- 716c30f: Add a stateless `@specify-sh/publisher-sdk/server` entry for serving ads without browser identity state. React Server Components that import the browser entry now receive an error directing them to `/server`.

### Patch Changes

- 716c30f: Publish the shared SDK core as a public package with JavaScript and TypeScript declarations. The publisher SDK now consumes core as a normal runtime dependency instead of copying its implementation into the publisher package.
- Updated dependencies [716c30f]
  - @specify-sh/core@0.1.0
