import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const edgeSource = fileURLToPath(
  new URL("../specify-edge/src/", import.meta.url)
);

if (!existsSync(`${edgeSource}app/v1/events/route.ts`)) {
  throw new Error(
    "SDK E2E tests need specify-edge checked out beside specify-sdks, with its dependencies installed. See test/e2e/README.md."
  );
}

export default defineConfig({
  resolve: { alias: { "@": edgeSource } },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 20_000,
    include: ["test/e2e/**/*.test.ts"],
    setupFiles: ["test/e2e/mocks.ts"],
    testTimeout: 15_000,
  },
});
