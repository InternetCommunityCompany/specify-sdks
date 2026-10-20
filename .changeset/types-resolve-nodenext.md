---
"@specify-sh/core": patch
"@specify-sh/publisher-sdk": patch
"@specify-sh/advertiser-sdk": patch
---

Types now resolve in projects that use `"moduleResolution": "NodeNext"`. Before, some types in those projects, such as `ValidationError`, resolved to `any`, so TypeScript couldn't narrow a caught error with `instanceof ValidationError`.

The server entries' types no longer need the DOM library, so a Node project with `lib: ["ES2022"]` type-checks without `skipLibCheck`.
