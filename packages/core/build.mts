import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "bun";

rmSync(resolve(process.cwd(), "dist"), { force: true, recursive: true });

console.log("Generating TypeScript declarations...");
execSync("bun run tsc --emitDeclarationOnly -p tsconfig.build.json", {
  stdio: "inherit",
});

console.log("Building with Bun...");
const result = await build({
  drop: ["debugger"],
  entrypoints: ["./src/index.ts"],
  env: "disable",
  format: "esm",
  minify: true,
  outdir: "./dist",
  sourcemap: "external",
  splitting: false,
  target: "browser",
});

if (!result.success) {
  throw new Error("Bun failed to build @specify-sh/core");
}

console.log("Build completed successfully");
