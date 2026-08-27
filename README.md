# Specify SDKs

This Bun workspace contains Specify's JavaScript SDK packages.

Install dependencies with `bun install`, then run the repository gates with `bun run check`, `bun run types`,
`bun run test`, and `bun run build`.

`biome.json` extends Ultracite and disables no rule. It sets `files.includes` because Ultracite's inherited exclusions
match `**/.cache`, which silently matches some checkout paths and leaves Biome checking zero files — `check` then passes
while checking nothing. It is written as `["**/*"]` rather than `["**"]` so it does not itself trip
`noBiomeFirstException`.

`build` and `types` run through `turbo run`, which caches each package's output and skips work a later run does not
need to redo. `check` and `test` do not, because Ultracite and Vitest already run across the whole workspace in one
process; there is no per-package split for turbo to schedule. `.turbo/` is gitignored because turbo writes a log file
under it inside each package, and an untracked file there would otherwise change that package's input hash on every
run and defeat the cache.
