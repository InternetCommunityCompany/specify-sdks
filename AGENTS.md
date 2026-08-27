# Every file here runs in two environments

The same package is imported into a browser page and into a Node server.

## Task Completion Requirements

- `bun run check` and `bun run types` must pass before considering tasks completed. Use `bun run check:fix` to auto-fix; do not disable Ultracite/Biome rules inline to silence them.
- `bun run test` must pass. This runs Vitest — never use `bun test`, which invokes Bun's built-in runner against a suite written for Vitest.
- `bun run build` must succeed for every package.
- Tests run in both a Node and a DOM environment. A path exercised in only one has no coverage in the other.
- Any change to a package's public exports needs a changeset in the same change.
- If anything is unimplementable or unfixable, raise to the user and don't burn tokens.

## Project Snapshot

`specify-sdks` holds Specify's client libraries, published to npm and installed by people who do not work here. A shared internal package carries the behaviour that must never differ between them; it is never published for direct use. Capabilities that exist only in a browser have no meaning server-side, and the API is shaped so a server caller never reaches them.

## Repo Conventions

- Nothing identifying is ever module-scoped. Module state is one user in a browser and every concurrent request on a server, so anything held there leaks between users. State belongs on an instance.
- Never throw into the host. Every public entry point catches its own errors and resolves to a safe empty result. The host's own work must not fail because ours did.
- Don't detect the environment at module scope — it breaks SSR and confuses bundlers. Decide at call time, or let the shape of the API carry it.
- No DOM in a path the server reaches, no Node built-ins in a path the browser reaches. `exports` conditions resolve the right build instead of failing at runtime.
- Browser-only features no-op on a server. They don't throw.
- Own nothing global: no globals beyond the documented entry point, no prototype patching, no unscoped CSS, no listener or timer without a teardown.
- Never trigger anything user-facing the host didn't ask for — no prompts, no dialogs, no navigation, no layout shifts.
- State that belongs to the host is read when it's needed, never cached. A stored copy becomes a second source of truth that can disagree with what the user sees.
- Nothing identifying is written to a cookie, `localStorage`, `sessionStorage` or IndexedDB without explicit consent.
- Anything exported is maintained indefinitely, and semver is a contract with people who can't be asked to change. What has already shipped runs on hosts we don't control and can't be deprecated by announcement.
- Error messages are read by integrators, not by us. Say what to do about it; never leak internal identifiers, endpoints, or upstream error bodies.
- The service owns the wire contract. A request or response shape changes there first — flag it rather than working around it here.

## Engineering Defaults

- Choose the simplest implementation that fully meets the current requirements. No speculative abstractions, configuration, or indirection.
- Grow the system in layers: start from the smallest version that works end to end, add capabilities on top of a working product. Never trade a working product for unfinished complexity.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Do not trust your training data when using external libraries. Find latest documentation and refer to them. You can use `llms.txt` files on many projects for this.
- Remove obsolete code instead of layering fallbacks or compatibility shims. The exception is a shim that is itself a shipped contract with an integrator — that outranks the rule.
- Comment sparingly (less = better). When you leave a comment, it should explain why, never what the code already says. Delete comments that restate the code.
- Write comments in plain language a junior developer new to this codebase can follow. Internally you may assume the domain terms this repo uses; on the public API you may not.
- JSDoc on an exported symbol is the hover text an integrator reads while wiring us up, so `@param`/`@returns` earn their place there even though they are noise everywhere else.

## Maintainability

These packages are small on purpose. Logic that can live on the server belongs there, not here: every dependency costs bytes in a browser and supply-chain surface on a server, and every export is something we maintain for as long as anyone runs it. Prefer platform APIs to libraries.

## Reference Material

- Ultracite docs: <https://www.ultracite.ai/llms.txt>
