# Specify Advertiser GTM template

Import `template.tpl` under **Templates → New → Import**, then create one tag
per action. The template forwards commands to the script-tag SDK from PR #32.
It adds no SDK logic or storage of its own.

| Action | Fields | When to fire |
| --- | --- | --- |
| Initialize | Advertiser key; SDK script URL; API URL | Initialization – All Pages, once per page |
| Update cookie consent | Boolean `true` / `false`, or their literal text values | When your consent manager decides, and whenever the decision changes |
| Identify user or wallets | Application user ID, one EVM address, or a variable returning an array of EVM addresses | Login or wallet connection |
| Capture event | Event name | After the corresponding action succeeds |
| Reset identity (logout) | None | Logout or account switch, before identifying the next user |

Set the initialization tag's SDK script URL to
`https://spfsrv.com/sdk/advertiser.js` for a normal installation. Leave it blank
only when loading the SDK separately. Initialization loads the SDK once. Other tags can run before it finishes:
GTM queues their commands and the SDK processes them after initialization.
Use a single advertiser key per page. Wallet arrays must come from a variable;
JSON text and comma-separated strings are not arrays. Unknown consent values
fail the tag without changing the current decision.

Consent controls the SDK's cookie use. Explicit user or wallet identification
can still send requests without cookies. Apply your site's collection policy
to tag triggers separately. Reset clears the SDK's remembered identity, not
service cookies or stored records.

GTM success means the command was submitted (and, for initialization, the
script loaded). Confirm actual delivery in Network or the receiving service.
The template only permits loading `https://spfsrv.com/sdk/advertiser.js`; the
normal API default is `https://spfsrv.com`. Release and hosting of that SDK are
separate from this template.

## Local verification

The existing **Specify Playground / Advertiser GTM test** container
(`GTM-KKJSBB7G`) uses an unpublished configuration. Keep local tests in Preview.

1. Run `bun run build` in `specify-sdks`.
2. In `advertiser-sdk-playground`, run `node scripts/gtm-receiver.mjs` and
   `bun run dev` in separate terminals.
3. Open `http://localhost:5174/gtm.html?container=GTM-KKJSBB7G` through GTM Preview.

The receiver serves the current SDK build and records requests in memory on
port 3001. It makes no Edge, Redis, ClickHouse, or other outbound calls and
accepts only the synthetic key `sak_000000000000000000000000000000`.
It is a mock receiver, not a service authentication or persistence test.

Configure the test workspace as follows:

| Tag | Action / configuration | Trigger |
| --- | --- | --- |
| Local SDK loader (Custom HTML) | `<script src="http://localhost:3001/sdk/advertiser.js"></script>` | Initialization – All Pages |
| Local initialize | Initialize; synthetic key above; API `http://localhost:3001`; SDK script URL empty | Initialization – All Pages |
| Local consent | Update cookie consent; `{{Specify value}}` | Custom Event `specify_consent` |
| Local identify | Identify user or wallets; `{{Specify value}}` | Custom Event `specify_identify` |
| Local test event | Capture event; `{{Specify event name}}` | Custom Event `specify_test` |
| Local reset | Reset identity | Custom Event `specify_reset` |

`Specify value` and `Specify event name` are Data Layer Variables for
`specify_value` and `specify_event_name`, respectively. Use data layer version 1
to replace wallet arrays on each event. The separate local script loader is
needed because GTM custom-template script injection requires HTTPS.

Use the page's action selector and **Refresh receipts** button to check:

- A capture before identity or consent is held; granting consent releases it.
- User IDs and wallet arrays reach the local receiver.
- Consent denial is forwarded as `false`, not interpreted as a truthy string.
- Reset followed by another user does not retain the previous user or wallets.
- Repeated captures produce distinct event IDs.

## Automated checks

The template includes four sandbox test scenarios. SDK tests
also execute its command code with the real SDK queue and a mocked transport
in both Node and DOM environments:

```sh
bun run check
bun run types
bun run test
bun run build
```

References: [sandbox APIs](https://developers.google.com/tag-platform/tag-manager/templates/api),
[permissions](https://developers.google.com/tag-platform/tag-manager/templates/permissions).
