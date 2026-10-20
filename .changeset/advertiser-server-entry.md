---
"@specify-sh/advertiser-sdk": major
---

Server events move to `@specify-sh/advertiser-sdk/server`: call `capture({ advertiserKey, event, identity, url, dedupeKey })` instead of `capture(name, identity, options)` on a client. Use the user ID your site passes to `identify()` in the browser, or a wallet address. Server `identify()` and the root `CaptureOptions` type are removed. The server `capture()` throws `ValidationError` for invalid options and never rejects because Specify is unreachable. Like the browser client, it ignores whitespace around the key. Pass `dedupeKey`, such as an order ID, so a repeat of the same event counts once.

In the browser, methods return nothing and never throw, `reset()` replaces `identify(null)`, and `capture(event)` no longer takes an identity. Consent now decides only whether Specify's cookie is used: identified visitors and visitors arriving from an ad are recorded before they answer your consent banner and after they decline. Events from anyone else wait for the answer and are dropped on a refusal. Invalid user IDs and a malformed advertiser key are ignored, and `identify()` given an array skips anything that isn't an EVM wallet address, such as a Solana address, instead of ignoring the whole call.

The client and the server `capture()` take an optional `apiUrl`; leave it unset unless Specify gives you another API URL.

Failed requests are retried. Importing the browser client from a React Server Component fails the build with a pointer to the server entry.
