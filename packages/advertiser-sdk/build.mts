import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "bun";

rmSync(resolve(process.cwd(), "dist"), { force: true, recursive: true });

execSync("bun run tsc --emitDeclarationOnly -p tsconfig.build.json", {
  stdio: "inherit",
});

const result = await build({
  drop: ["debugger"],
  entrypoints: ["./src/index.ts", "./src/server.ts", "./src/react-server.ts"],
  env: "disable",
  external: ["@specify-sh/core"],
  format: "esm",
  minify: true,
  outdir: "./dist",
  sourcemap: "external",
  splitting: false,
  target: "browser",
});

if (!result.success) {
  throw new Error("Bun failed to build @specify-sh/advertiser-sdk");
}

const script = await build({
  drop: ["debugger"],
  entrypoints: ["./src/script.ts"],
  env: "disable",
  format: "iife",
  minify: true,
  outdir: "./dist",
  sourcemap: "external",
  target: "browser",
});

if (!script.success) {
  throw new Error("Bun failed to build the @specify-sh/advertiser-sdk script");
}
