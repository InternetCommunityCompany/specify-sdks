---
"@specify-sh/publisher-sdk": patch
---

Ad requests no longer send cookies until `setCookieConsent(true)` is called, and stop sending them again once consent is withdrawn.
