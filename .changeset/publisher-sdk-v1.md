---
"@specify-sh/publisher-sdk": major
---

Release the publisher SDK as v1. `@specify-sh/sdk` is deprecated and this package replaces it.

Breaking changes from v0.4.x:

- `cacheMostRecentAddress` and the `localId` browser cache are gone. Specify's identity cookie replaces them and resolves across the network rather than one site.
- `cookieConsent` is no longer a constructor option. `setCookieConsent()` is the only way to grant it.
- `walletAddress` is no longer returned on `SpecifyAd`. After a cookie-only serve it could name a wallet the caller never sent.
- `imageUrl` is typed `string | null`. It was `string` in v0.4.x even though a `NO_IMAGE` placement has no image.
- `AuthenticationError`, `APIError` and `NotFoundError` are gone. `ValidationError` is the only error thrown, and it no longer carries `details`.
- Importing the browser entry from a React Server Component now throws, directing the caller to `@specify-sh/publisher-sdk/server`.
