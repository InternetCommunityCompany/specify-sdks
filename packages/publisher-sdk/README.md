# @specify-sh/publisher-sdk

Serve Specify ads from a browser or a server.

```bash
npm install @specify-sh/publisher-sdk
```

```ts
import Specify, { ImageFormat } from '@specify-sh/publisher-sdk';

const specify = new Specify({ publisherKey: 'spk_your_publisher_key_here' });

const ad = await specify.serve(wallet ?? null, {
  imageFormat: ImageFormat.LANDSCAPE,
  showAdLabel: true
});
```

`showAdLabel` requests an image with an 'Ad' label. It defaults to false and is available in browser `serve()`, server `serve()`, and `useSpecifyAd()` options. Keep rendering `ad.imageUrl` as usual. Text-only ads have no image to label.

**[Get started →](https://docs.specify.sh/publishing/get-started)**

- [Browser SDK reference](https://docs.specify.sh/publishing/sdk-browser)
- [Node.js SDK reference](https://docs.specify.sh/publishing/sdk-server)
- [Migrating from v0.4.x](https://docs.specify.sh/publishing/migrating-from-v0-4)

MIT © The Internet Community Company
