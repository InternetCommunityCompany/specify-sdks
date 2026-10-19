# @specify-sh/advertiser-sdk

Record conversions with [Specify](https://specify.sh) from a browser or a server.

```bash
npm install @specify-sh/advertiser-sdk
```

In the browser:

```ts
import Specify from '@specify-sh/advertiser-sdk';

const specify = new Specify({ advertiserKey: 'sak_your_advertiser_key' });

specify.setCookieConsent(consentGiven);
specify.identify(userId);
specify.capture('signup');
```

On a server:

```ts
import { capture } from '@specify-sh/advertiser-sdk/server';

await capture({
  advertiserKey: 'sak_your_advertiser_key',
  event: 'purchase',
  identity: userId,
  dedupeKey: orderId,
});
```

**[Get started →](https://docs.specify.sh/advertising/track-conversions)**

- [Browser SDK reference](https://docs.specify.sh/advertising/sdk-browser)
- [Server events](https://docs.specify.sh/advertising/server)

MIT © The Internet Community Company
