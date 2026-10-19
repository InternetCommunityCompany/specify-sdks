# Advertiser SDK launch — 2026-10-19

- [x] Apply production ClickHouse DDL (you confirmed this on October 14).
- [ ] Verify production schema, completed mutations, and Edge runtime SELECT/INSERT permissions.
- [x] Restore SDK endpoint to `https://spfsrv.com/v1`, align test assertions, and commit the batching changeset.
- [x] Fold [SDK #25](https://github.com/InternetCommunityCompany/specify-sdks/pull/25) into [#24](https://github.com/InternetCommunityCompany/specify-sdks/pull/24), including the wizard and latest SDK batching changes.
- [x] Pass local SDK `bun run check`, `types`, `test`, `build`, and `verify:package` (499 passed, 81 skipped).
- [ ] Confirm final SDK/Edge CI, including Edge's ClickHouse tests.
- [ ] Merge [Edge #38](https://github.com/InternetCommunityCompany/specify-edge/pull/38) and verify its production deployment at `spfsrv.com` uses production services.
- [ ] Test deployed click → `spclk` → consent/identify → browser batches → Node capture. Verify CORS/cookies and actual ClickHouse events/mappings with an app-issued production key; development keys do not persist.
- [ ] Merge SDK #24 after Edge is verified.
- [ ] Confirm first-publish access and npm trusted publishing for `@specify-sh/advertiser-sdk` (not yet on npm).
- [ ] Let Changesets refresh [release #23](https://github.com/InternetCommunityCompany/specify-sdks/pull/23), then merge it and verify the Release workflow and npm versions. It currently contains only a publisher patch; advertiser SDK and wizard releases must be included.
- [ ] Replace `file:` SDK dependencies in all three examples with the published npm version; regenerate lockfiles and remove `sdk:build`/sibling-checkout instructions.
- [ ] Fix Next.js README's stale “identification first” wording and replace sibling-repo documentation links with public URLs.
- [ ] Build/run React, Next.js, and Node examples from fresh installs without the SDK checkout; verify browser/server capture with the npm package.
- [ ] Review examples' tracked files/history for credentials, then make [the repository](https://github.com/InternetCommunityCompany/advertiser-sdk-examples) public (currently private).
- [ ] Merge/deploy [docs #14](https://github.com/InternetCommunityCompany/specify-docs/pull/14); verify public docs, examples links, and `llms-full.txt`. Smoke-test published `npx @specify-sh/wizard --advertiser`.
- [ ] Enable [PostHog `advertiser-keys`](https://eu.posthog.com/project/61771/feature_flags/305646) for the intended audience; verify sidebar/page, key creation/revocation, and Edge acceptance. This is the only advertiser flag found in current code; its last recorded setting was disabled, 100% rollout.

Basis: prior launch, production-schema, wizard, batching, and feature-flag chats; current PRs, checkouts, and npm registry. Production deployment/schema and live PostHog state remain unverified today.
