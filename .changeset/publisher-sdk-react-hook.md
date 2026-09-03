---
"@specify-sh/publisher-sdk": minor
---

Add a `@specify-sh/publisher-sdk/react` entry exporting `useSpecifyAd()`, a
hook that turns a Client Component into an ad slot. Pass your Specify client
in the options, with an optional wallet address or array ahead of them:
`useSpecifyAd({ specify, imageFormat })` or
`useSpecifyAd(wallets, { specify, imageFormat, adUnitId })`. It serves once on
mount, serves again when `identify()` registers a new wallet or consent is
granted, and returns the ad or null while the slot is empty. The first ad to
arrive is kept for the life of the component: a filled slot never swaps or
goes blank, and later wallet changes are ignored. An inline wallet array and
a fresh options object per render are safe; neither triggers another serve.
Errors never reach your component — a bad address leaves the slot empty. The
entry ships with a `use client` directive, React 18 or 19 is an optional peer
dependency, and importing it from a Server Component fails its build with a
message pointing at `@specify-sh/publisher-sdk/server`.
