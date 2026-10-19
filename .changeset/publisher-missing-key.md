---
"@specify-sh/core": patch
"@specify-sh/publisher-sdk": patch
---

A missing or non-string publisher key now throws `ValidationError`, like a malformed one, instead of a `TypeError`.
