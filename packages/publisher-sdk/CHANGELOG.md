# @specify-sh/publisher-sdk

## 1.1.0

### Minor Changes

- 85d168f: Add `onIdentityChange(listener)` to the publisher SDK. Register a listener to
  find out when a new `serve()` call would send a better identity than the last
  one would have: a wallet address newly added via `identify()`, or cookie
  consent newly granted via `setCookieConsent(true)`. Use it to re-serve an
  already-rendered ad slot when the user connects a wallet mid-session. A
  consent withdrawal and the eviction of old addresses past the 50-address cap
  do not fire it. Several changes in the same tick coalesce into one listener
  call, delivered in a microtask after the change. It returns an unsubscribe
  function that detaches the listener and is safe to call twice. Outside a
  browser, such as during a server render, it does nothing and still hands back
  a callable unsubscribe.
- abc6b9d: Add a `@specify-sh/publisher-sdk/react` entry exporting `useSpecifyAd()`, a
  hook that turns a Client Component into an ad slot. Pass your Specify client
  in the options, with an optional wallet address or array ahead of them:
  `useSpecifyAd({ specify, imageFormat })` or
  `useSpecifyAd(wallets, { specify, imageFormat, adUnitId })`. It serves once on
  mount, serves again when `identify()` registers a new wallet or consent is
  granted, and returns the ad or null while the slot is empty. The first ad to
  arrive is kept for the life of the component: a filled slot never swaps or
  goes blank, and later wallet changes are ignored. An inline wallet array and
  a fresh options object per render are safe; neither triggers another serve.
  Errors never reach your component — a bad address leaves the slot empty. The
  entry ships with a `use client` directive, React 18 or 19 is an optional peer
  dependency, and importing it from a Server Component fails its build with a
  message pointing at `@specify-sh/publisher-sdk/server`.

### Patch Changes

- 2b5a13e: Track the pending identity-change flush as a nullable promise instead of a boolean, so the coalescing guard reads as reachable to static analysis.

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
