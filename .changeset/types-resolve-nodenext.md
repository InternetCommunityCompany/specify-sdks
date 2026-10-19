---
"@specify-sh/core": patch
"@specify-sh/publisher-sdk": patch
"@specify-sh/advertiser-sdk": patch
---

Types now resolve in projects that use `"moduleResolution": "NodeNext"`. Before, some types in those projects, such as `ValidationError`, resolved to `any`, so TypeScript couldn't narrow a caught error with `instanceof ValidationError`.
