---
"@specify-sh/advertiser-sdk": minor
---

Add a script-tag build for tag managers and sites without a bundler. Load `https://cdn.jsdelivr.net/npm/@specify-sh/advertiser-sdk@1/dist/script.js` and send commands through `specifyAdvertiser`: `specifyAdvertiser('init', { advertiserKey })`, then `setCookieConsent`, `identify`, `capture` and `reset` with the same arguments as the client methods. Commands sent before the script loads are queued and run in order. Commands sent before `init` wait for it. A second `init`, or a second copy of the script on the same page, is ignored.
