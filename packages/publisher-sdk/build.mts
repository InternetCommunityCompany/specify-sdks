import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// Ensure a clean state for the new build output
rmSync(resolve(process.cwd(), "dist"), { force: true, recursive: true });

// First, generate TypeScript declarations
console.log("Generating TypeScript declarations...");
execSync("bun run tsc --emitDeclarationOnly -p tsconfig.build.json", { stdio: "inherit" });

// Then build with Bun
console.log("Building with Bun...");
await Bun.build({
  drop: ["debugger"], // remove debugger statements
  entrypoints: ["./src/index.ts"],
  env: "disable",
  footer: `
      /* Built with ❤️ by Specify team */
    `,
  format: "esm", // to use ES Module syntax in browsers, set format to "esm" and make sure your <script type="module"> tag has type="module" set.
  minify: true,
  outdir: "./dist",
  sourcemap: "external", // separate .map files instead of inlining
  target: "browser", // Changed from "node" to "browser"
});

console.log("✅ Build completed successfully");
