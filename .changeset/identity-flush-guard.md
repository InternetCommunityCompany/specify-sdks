---
"@specify-sh/publisher-sdk": patch
---

Track the pending identity-change flush as a nullable promise instead of a boolean, so the coalescing guard reads as reachable to static analysis.
