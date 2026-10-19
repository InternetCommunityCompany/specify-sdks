# @specify-sh/advertiser-sdk

Capture browser or server events with [Specify](https://specify.sh) using your organization's advertiser key.
Use the same import in both environments. Each call checks whether `window` exists;
there is no mode configuration.

## Install

```bash
npm install @specify-sh/advertiser-sdk
```

## Browser usage

```ts
import Specify from '@specify-sh/advertiser-sdk';

const specify = new Specify({
  advertiserKey: 'your-advertiser-key',
});

specify.setCookieConsent(consentManager.hasTrackingConsent());
await specify.identify('customer_123');
await specify.identify('0x1111111111111111111111111111111111111111');
const status = await specify.capture('purchase');
```

### `setCookieConsent(granted)`

Consent starts false. Call this setter on page load and whenever your consent
manager reports a change. Only exactly `true` allows browser requests.

Before consent, `identify()` remembers the latest identity and `capture()` buffers
events in instance memory. Granting consent sends that pending identification
and starts flushing buffered events in capture order, without waiting for
identification to finish. The setter returns void. Repeating a grant does not
replay attempted requests.

Withdrawing consent pauses unsent requests. Requests already sent may complete;
a later grant resumes the queue. The backend also requires consent before
reading cookies or resolving browser identity.

### `identify(identity)`

Selects an exact user ID or remembers wallets immediately, then calls
`/v1/identify` when consent is granted. Identification persists identity without
recording an event. Identifying a new user ID replaces the previous ID;
identifying wallets retains it. Empty strings and invalid wallets leave previous
state intact. Other user IDs update local state before service validation.

The SDK rejects empty user IDs locally and delegates other user-ID validation
to the service. The service requires IDs to be nonblank, contain no `@`, and fit
in 256 UTF-8 bytes. A `0x` prefix requires a valid wallet. IDs are preserved exactly,
including case and surrounding spaces. Arrays contain wallets only. Each client
remembers up to 50 wallets; repeated identification refreshes a wallet's position.

`identify(null)` clears the selected user ID, remembered wallets, and any
identification deferred until consent. Deferred calls have already returned
`null`. It preserves captured event snapshots and does not delete Specify's
HttpOnly cookie or server mappings. Requests already sent may still complete.
`identify(undefined)` and an empty wallet array do nothing.

### `capture(name, identity?, options?)`

Snapshots a nonempty event name, the complete page URL, selected user ID when
present, remembered wallets, and the first `spclk` query parameter when present.
Later identity or URL changes do not alter that event. Before consent, capture
returns null immediately and keeps the snapshot in memory until consent is
granted. Consecutive buffered events with the same user ID, wallets, and landing
token are sent together, up to 50 events and 16 KiB of JSON per request. Each event
keeps its captured URL.
With consent, new captures send directly, even while the buffer is flushing.
They may reach the service before older buffered events or finish out of order.
Identification sends independently and never blocks captures: `/v1/events`
resolves the identity in each event's snapshot itself. Sending starts immediately;
there is no timer that waits for more events.

An explicit identity applies only to that event and replaces the remembered user
ID and wallets in its snapshot. It does not change the identity used by later
captures. Browser calls always use the current page URL.

Requests include cookie credentials. The backend resolves the supplied evidence
to one Specify identity (SpID), creates one for an unknown user ID or wallet, and
merges existing identities using the oldest surviving SpID. User IDs are scoped
to your advertiser organization. Successful identification or capture can set
or refresh the sealed HttpOnly identity cookie.

The full event URL is recorded, including repeated query parameters and fragments.
The SDK reads `spclk` from the page without removing it or storing it separately.
The service validates the landing token but does not enforce an age limit.
Event timestamps reflect service receipt time.

The buffer belongs to the instance, has no configured size limit, and is lost on
reload or when the instance is discarded. It is never persisted to browser
storage. Initialization sends nothing. During SSR, calls follow the server rules
below. Keep browser identification and consent callbacks in client-side code.

## Server usage

```ts
import Specify from '@specify-sh/advertiser-sdk';

const specify = new Specify({ advertiserKey: 'your-advertiser-key' });
await specify.identify('customer_123');
await specify.capture('purchase', 'customer_123');
await specify.capture('purchase', 'customer_123', {
  url: 'https://shop.example/orders/123',
});
```

Supply one exact user ID or valid wallet independently for each call.
`identify(identity)` persists identity without recording an event; it is optional
before capture and does not select a user for later calls. Although the identity
argument is optional in TypeScript, server calls without a nonempty identity
return `null` without sending a request, including captures after `identify()`.
Server calls retain no identity state and require neither browser consent nor
cookie credentials. `setCookieConsent()` does nothing on a server.
An omitted URL stays absent on the wire. The backend resolves or
creates the identity and persists it before recording the event. Identity-service
failure can prevent capture.

## Results and failures

`identify()` and `capture()` return `Promise<number | null>` in both environments.
Received HTTP statuses pass through without reading the response body: `200`
accepted, `400` invalid request or missing identity, `401` invalid key, `403`
missing browser consent, `429` rate limit exceeded, or `503` service unavailable.
Other received statuses, including `204`, also pass through.

Buffered captures have already returned null; flushing does not change that
result. Consented captures return their own request's HTTP status. The service
validates each whole batch before insertion and counts every event against the
rate limit. One invalid event rejects the batch. Server captures send immediately
as one-event requests and do not share a background queue.

Null means local rejection, a no-op, deferred identification, a buffered capture,
or no response. Missing keys, invalid input,
server calls without identity, network failures, and timeouts are contained without throwing
into the host or logging automatically. Requests time out after 60 seconds when
AbortController is available.
An individual request exceeding 16 KiB of JSON returns null without transport.

The events endpoint accepts an `events` array with shared identity fields. Deploy
the matching Edge endpoint before using this SDK version; the previous singular
`event` request format is no longer sent.

Requests are attempted once, with no automatic retries or durable offline queue.
A lost response does not establish whether storage succeeded. Development keys
validate requests without persisting identities or events or setting cookies.

MIT © 2026 The Internet Community Company
