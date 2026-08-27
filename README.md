# Specify SDKs

This Bun workspace contains Specify's JavaScript SDK packages.

Install dependencies with `bun install`, then run the repository gates with `bun run check`, `bun run types`,
`bun run test`, and `bun run build`.

`biome.json` overrides `files.includes` because Ultracite's inherited exclusions include `**/.cache`, which silently
matches some checkout paths and leaves Biome checking zero files; the override keeps `node_modules`, `dist`, and
`coverage` excluded. Removing it can make `check` pass while checking nothing.
