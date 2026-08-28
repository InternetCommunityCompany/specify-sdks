---
"@specify-sh/publisher-sdk": minor
---

Add `setCookieConsent()`, `hasCookieConsent()`, and `identify()` to the publisher SDK. `setCookieConsent()` is the only way to grant consent for Specify's identity cookie: a new instance starts without it, and the next `serve()` reflects a change without a reload. `identify()` registers wallet addresses that ride along on every later `serve()` call. Both mutators do nothing outside a browser, so `cookieConsent` is no longer a constructor option — consent can only be granted where a browser exists.
