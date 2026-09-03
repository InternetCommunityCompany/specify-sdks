---
"@specify-sh/publisher-sdk": minor
---

Add `onIdentityChange(listener)` to the publisher SDK. Register a listener to
find out when a new `serve()` call would send a better identity than the last
one would have: a wallet address newly added via `identify()`, or cookie
consent newly granted via `setCookieConsent(true)`. Use it to re-serve an
already-rendered ad slot when the user connects a wallet mid-session. A
consent withdrawal and the eviction of old addresses past the 50-address cap
do not fire it. Several changes in the same tick coalesce into one listener
call, delivered in a microtask after the change. It returns an unsubscribe
function that detaches the listener and is safe to call twice. Outside a
browser, such as during a server render, it does nothing and still hands back
a callable unsubscribe.
