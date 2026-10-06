# Advertiser functional tests

These tests run the built advertiser SDK in Chromium and Node, with real HTTP
requests to the actual `specify-edge` event handler. Redis and ClickHouse access
use in-memory fixtures. No running databases, service credentials, `.env` files,
or deployed services are needed. This advertiser path has no relational database
dependency.

## Run

Keep the repositories beside each other and install their dependencies once:

```text
parent/
  specify-sdks/
  specify-edge/
```

```bash
# From specify-sdks:
bun install
bun install --cwd ../specify-edge
bunx --no-install playwright install chromium
bun run test:e2e
```

Dependency/browser installation needs network access; the tests themselves do
not. The command builds the advertiser SDK and core, checks the test types, and
runs Vitest. The timeout scenario uses the real 60-second timer, so a full run
takes a little over a minute. Use `bun run test:e2e -t "cookie"` for a focused run.
Use `bun run test`, never `bun test`, for the existing Node/jsdom suite.

Failed browser tests save Playwright traces under ignored `test-results/`.
Open one with `bunx --no-install playwright show-trace test-results/<id>.zip`.
Each test gets fresh browser cookies and storage fixtures; the browser and local
HTTP server are closed after the suite.

## What runs for real

- The built SDK's public package entry, bundled as a consumer would bundle it.
- Edge request validation, credential interpretation, identity resolution and
  persistence decisions, cookie encryption, event writer, and response formatting.
- Browser fetch, SDK consent/identity state, and an HttpOnly cookie round trip.
- A Node import and server-side no-op call through the same built package.

`mocks.ts` replaces only storage access, environment configuration, and error
reporting. It reuses Edge's existing identity fixture instead of duplicating
identity rules. The event writer still runs; the ClickHouse insert boundary
records its rows and can reject writes. Unexpected server fetches and browser
requests outside the test origin fail locally.

The SDK's fixed `https://spfsrv.com` endpoint is bridged by Playwright to a server
bound to `127.0.0.1` on an ephemeral port. Both the consumer page and event endpoint
use that virtual origin. Nothing is sent to the real domain. Production SDK and
Edge code are unchanged.

## Scenarios

- Initialization/identification without requests or browser storage writes, then
  consented capture with the correct wallet, URL, organization, and identity.
- Consent withdrawal/regrant and recovery from a throwing consent getter.
- Anonymous and tampered-cookie refusal, followed by wallet-based recovery.
- A returning visitor with a real sealed cookie and no remembered wallet.
- Wallet changes/disconnects and all-or-nothing rejection of an invalid batch.
- Repeated identical events and an SPA URL change.
- Development keys accepting validation without identity/event writes or cookies.
- Invalid credentials, unavailable key lookup, and identity/event write failures, including wallet persistence on retry.
- Dropped connections, unreadable responses, lost responses after a write, and
  recovery. No automatic retries.
- The actual 60-second timeout while the host remains usable.
- Safe server-side calls without reading browser-only host configuration.

## Deliberate gaps

- An accepted insert proves a write was requested. It does not prove SQL/schema
  correctness, Redis TTL/transaction behavior, database timestamps, or ClickHouse
  durability/deduplication.
- The HTTP adapter calls the real route handler, without starting Next.js.
  Deployment configuration, middleware, cross-site CORS/preflight, third-party
  cookie restrictions, and unload/keepalive delivery are not covered by this
  same-origin routing bridge.
- This first slice covers advertiser journeys. Publisher/React journeys, wallet
  retention limits, simultaneous clients, and identity merge races remain for a
  later pass. There is no wallet extension or consent-manager library involved;
  the consumer calls the public API and supplies host-owned consent directly.
- Tests consume the adjacent Edge checkout, including any local edits. CI wiring
  is deferred: the existing SDK job would need an authorized checkout of the
  private Edge repository and its dependencies, plus Chromium. The normal SDK
  checks continue to work without that checkout. This suite is explicitly run
  with `bun run test:e2e` and is never silently skipped for a missing service repo.
- These tests exercise built workspace packages. `bun run verify:package` remains
  the separate check for the tarballs an integrator installs.

All new tests, fixtures, and configuration live outside package `src` directories.
Package builds and `files: ["dist"]` publishing rules exclude them.
