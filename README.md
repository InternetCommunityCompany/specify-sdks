# Specify SDKs

Client libraries for [Specify](https://specify.sh), the ad network for onchain audiences.

| Package | |
| --- | --- |
| [`@specify-sh/publisher-sdk`](https://www.npmjs.com/package/@specify-sh/publisher-sdk) | Serve ads in a browser, on a server, or from a React component |
| [`@specify-sh/advertiser-sdk`](packages/advertiser-sdk) | Identify users and capture browser or server events |
| [`@specify-sh/wizard`](https://www.npmjs.com/package/@specify-sh/wizard) | `npx @specify-sh/wizard` adds the publisher SDK; use `--advertiser` for the advertiser SDK |
| `@specify-sh/core` | Shared internals. Not meant to be installed directly |

## Documentation

- [Publisher SDK setup](https://docs.specify.sh/publishing/get-started)
- [Publisher browser SDK reference](https://docs.specify.sh/publishing/sdk-browser)
- [Publisher Node.js SDK reference](https://docs.specify.sh/publishing/sdk-server)
- [Publisher SDK migration from v0.4.x](https://docs.specify.sh/publishing/migrating-from-v0-4)
- [Advertiser SDK setup](https://docs.specify.sh/advertising/analytics-sdk-setup)

## Development

```bash
bun install
bun run check
bun run types
bun run test
bun run build
```

Changes to a package's public exports need a changeset:

```bash
bunx changeset
```

MIT © The Internet Community Company
