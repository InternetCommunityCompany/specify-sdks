# Specify SDKs

Client libraries for [Specify](https://specify.sh), the ad network for onchain audiences.

| Package | |
| --- | --- |
| [`@specify-sh/publisher-sdk`](https://www.npmjs.com/package/@specify-sh/publisher-sdk) | Serve ads in a browser, on a server, or from a React component |
| [`@specify-sh/wizard`](https://www.npmjs.com/package/@specify-sh/wizard) | `npx @specify-sh/wizard` adds the publisher SDK with your own coding agent |
| `@specify-sh/core` | Shared internals. Not meant to be installed directly |

## Documentation

**[docs.specify.sh/publishing/get-started](https://docs.specify.sh/publishing/get-started)**

- [Browser SDK reference](https://docs.specify.sh/publishing/sdk-browser)
- [Node.js SDK reference](https://docs.specify.sh/publishing/sdk-server)
- [Migrating from v0.4.x](https://docs.specify.sh/publishing/migrating-from-v0-4)

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
