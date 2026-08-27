import { defineConfig } from "vitest/config";

const include = ["packages/*/test/**/*.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          environment: "node",
          include,
          name: "node",
        },
      },
      {
        test: {
          environment: "jsdom",
          include,
          name: "dom",
        },
      },
    ],
  },
});
