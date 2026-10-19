---
"@specify-sh/advertiser-sdk": major
---

Server events move to `@specify-sh/advertiser-sdk/server`: call `capture({ advertiserKey, event, identity, url, dedupeKey })` instead of `capture(name, identity, options)` on a client. Server `identify()` and the root `CaptureOptions` type are removed. A user ID counts once your site has passed it to `identify()` in the browser. The server `capture()` throws `ValidationError` for invalid input and never rejects for a failure on Specify's side. Pass `dedupeKey`, such as an order ID, so repeats of the same event count once.

In the browser, methods return nothing and never throw, `reset()` replaces `identify(null)`, and `capture(event)` no longer takes an identity. Events and identification wait in memory until `setCookieConsent()` is first called; after a refusal they are sent without the cookie instead of being held. The client remembers the ad click that brought the visitor for the rest of the page session. Invalid user IDs and a malformed advertiser key are ignored instead of being sent.

Each request is attempted up to three times on network errors, timeouts, 429 and 5xx responses. Importing the browser client from a React Server Component fails the build with a pointer to the server entry.
