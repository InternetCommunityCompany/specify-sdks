---
"@specify-sh/publisher-sdk": minor
---

Add `setCookieConsent()`, `hasCookieConsent()`, and `identify()` to the publisher SDK. `setCookieConsent()` updates the consent signal after construction so the next `serve()` reflects it without a reload. `identify()` registers wallet addresses that ride along on every later `serve()` call. Both mutators do nothing outside a browser.
