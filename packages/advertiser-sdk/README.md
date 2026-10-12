# @specify-sh/advertiser-sdk

Capture browser events with [Specify](https://specify.sh) using your organization's advertiser key and tracking consent.

## Install

```bash
npm install @specify-sh/advertiser-sdk
```

## Usage

```ts
import Specify from '@specify-sh/advertiser-sdk';

const specify = new Specify({
  advertiserKey: 'your-advertiser-key',
  getConsent: () => consentManager.hasTrackingConsent(),
});

specify.identify('0x1111111111111111111111111111111111111111');

const status = await specify.capture('user_signed_up');
if (status !== 200) {
  console.error(status === null ? 'No HTTP response.' : `HTTP ${status}`);
}
```

Supply `getConsent` from your consent manager. The SDK reads it before each
capture; only `true` allows a request. Initialization and identification send
no requests and write no browser storage. Tracking runs only in the browser;
server-side calls are inactive and safe for SSR.

## API

### `new Specify({ advertiserKey, getConsent })`

Creates a client with your advertiser key and a synchronous getter for the
current tracking consent. A missing or throwing getter blocks capture.

### `identify(addressOrAddresses)`

Accepts a wallet address, an array of addresses, `null`, or `undefined`. Call
when a wallet connects, is restored, or changes. Each client remembers up to
50 addresses in memory; identifying a duplicate refreshes its position.
Disconnecting a wallet does not clear it. Invalid input leaves the remembered
addresses unchanged.

### `capture(name)`

Sends a named event with the current page URL and remembered wallets. The
request includes available Specify identity cookies. Event names must be
nonempty strings.

Resolves to the numeric HTTP status code without reading the response body:
`200` accepted, `400` invalid request or missing identity, `401` invalid key,
`403` missing consent, `429` rate limit exceeded, or `503` service unavailable.

Returns `null` when no HTTP response is received: server-side calls, blocked
consent, missing keys, invalid event names, throwing consent getters, network
failures, or timeouts. It never throws or logs automatically.

Requests time out after 60 seconds when `AbortController` is available.
Delivery is best-effort, with no buffering or automatic retries. Withdrawing
consent blocks new requests; requests already sent may still complete.

MIT © 2026 The Internet Community Company
