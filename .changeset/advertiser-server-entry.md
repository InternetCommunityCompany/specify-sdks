---
"@specify-sh/advertiser-sdk": major
---

Server events move to `@specify-sh/advertiser-sdk/server`: call `capture({ advertiserKey, event, identity, url, dedupeKey })` instead of `capture(name, identity, options)` on a client. Use the user ID your site passes to `identify()` in the browser, or a wallet address. Server `identify()` and the root `CaptureOptions` type are removed. The server `capture()` throws `ValidationError` for invalid options and never rejects because Specify is unreachable. Pass `dedupeKey`, such as an order ID, so a repeat of the same event counts once.

In the browser, methods return nothing and never throw, `reset()` replaces `identify(null)`, and `capture(event)` no longer takes an identity. Nothing is sent until `setCookieConsent()` is first called, and events from visitors who decline are now recorded too. Invalid user IDs and a malformed advertiser key are ignored.

Failed requests are retried. Importing the browser client from a React Server Component fails the build with a pointer to the server entry.
