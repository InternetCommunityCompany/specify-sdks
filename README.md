# Specify SDKs

This Bun workspace contains Specify's JavaScript SDK packages.

Install dependencies with `bun install`, then run the repository gates with `bun run check`, `bun run types`,
`bun run test`, and `bun run build`.

`biome.json` extends Ultracite and disables no rule. It sets `files.includes` because Ultracite's inherited exclusions
match `**/.cache`, which silently matches some checkout paths and leaves Biome checking zero files — `check` then passes
while checking nothing. It is written as `["**/*"]` rather than `["**"]` so it does not itself trip
`noBiomeFirstException`.
