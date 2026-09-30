# @specify-sh/advertiser-sdk

Private package scaffold for the Specify advertiser SDK. It is not published yet.

The only export is a local smoke check that works in browsers and Node.js:

```ts
import { health } from '@specify-sh/advertiser-sdk';

health(); // true
```

`health()` does not contact the service. Tracking and identification are not implemented.

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
