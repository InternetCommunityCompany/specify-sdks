import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const include = [
  "packages/*/test/**/*.test.ts",
  "packages/*/test/**/*.test.tsx",
];

// Without this, @specify-sh/core resolves to its last build, so a core change
// goes untested until someone rebuilds it.
const resolve = {
  alias: {
    "@specify-sh/core": fileURLToPath(
      new URL("./packages/core/src/index.ts", import.meta.url)
    ),
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          environment: "node",
          include,
          name: "node",
        },
      },
      {
        resolve,
        test: {
          environment: "jsdom",
          include,
          name: "dom",
        },
      },
    ],
  },
});
