# @specify-sh/advertiser-sdk

Specify advertiser SDK for browser event capture. It is not published yet.

Create a client in browser code with your organization's advertiser key:

```ts
import Specify from '@specify-sh/advertiser-sdk';

const specify = new Specify({
  advertiserKey: 'your-advertiser-key',
  getConsent: () => consentManager.hasTrackingConsent(),
});

// Call when a wallet connects, is restored, or changes.
specify.identify('0x1111111111111111111111111111111111111111');

// Call explicitly when a product milestone happens.
const result = await specify.capture('user_signed_up');
if (!result.success) {
  console.error(result.error, result.details);
}
```

Initialization makes no network requests and writes no browser storage. Invalid
configuration leaves the client inactive without throwing. Server-side construction
is a no-op for safe SSR imports; tracking is browser-only.

`getConsent()` is read before every capture. Only `true` permits a request.
Your consent manager owns the saved choice, expiry, and withdrawal; Specify
does not cache consent or write a separate consent cookie. A missing, throwing,
or not-yet-ready getter blocks capture safely. The getter is not called on a server.

`identify(wallet)` accepts one wallet address, an array, `null`, or `undefined`. It remembers
valid addresses locally even without consent, sends no requests, and writes no
storage. Disconnecting does not clear wallets. Like the publisher SDK, it keeps
the 50 most recently identified addresses; identifying a duplicate refreshes its
position. Invalid input ignores the whole call without throwing. Calls outside a
browser do nothing.

`capture(name)` sends one event to Specify only when consent has been granted.
It includes the current page URL, remembered wallets, and any available Specify
identity cookie through a credentialed request. With no remembered wallets, the
service uses the cookie; if neither source identifies the user, it discards the
event without creating an anonymous identity. The service supplies the timestamp.

Capture resolves to `{ success: true, error: null }` when the service accepts the
capture. With a development key, success confirms validation without database
writes or identity cookies. With a production key, success confirms event storage.
The service determines the mode from the key; the SDK needs no development flag.

Skipped or unconfirmed captures resolve to `{ success: false, error: string }`.
The SDK passes through the service's success and error result without translating
HTTP statuses into error messages. It supplies its own messages only for local
validation, transport failures, or an unreadable response.
Validation failures can also include `details`, an array of `{ field, message }`
entries identifying invalid request fields. The SDK preserves the service's entries.

Messages are for developers; do not parse them as error codes.
Capture never throws or logs automatically. Production callers can
ignore the result, while integration examples can await and inspect it.

Requests time out after 60 seconds when `AbortController` is available. A lost
response can leave a stored event unconfirmed. Delivery is best-effort, with no
buffering or automatic retries.
Requests use `keepalive` to allow completion during navigation. Withdrawing
consent blocks new requests but does not cancel ones already sent.

From the repository root:

```bash
bun install
bun run check
bun run types
bun run test
bun run build
bun run verify:package
```

MIT © The Internet Community Company
