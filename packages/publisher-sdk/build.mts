import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "bun";

// Ensure a clean state for the new build output
rmSync(resolve(process.cwd(), "dist"), { force: true, recursive: true });

// First, generate TypeScript declarations
console.log("Generating TypeScript declarations...");
execSync("bun run tsc --emitDeclarationOnly -p tsconfig.build.json", {
  stdio: "inherit",
});

// Then build with Bun
console.log("Building with Bun...");
await build({
  drop: ["debugger"], // remove debugger statements
  entrypoints: [
    "./src/index.ts",
    "./src/server.ts",
    "./src/react-server.ts",
    "./src/react.react-server.ts",
  ],
  env: "disable",
  external: ["@specify-sh/core"],
  footer: `
      /* Built with ❤️ by Specify team */
    `,
  format: "esm", // to use ES Module syntax in browsers, set format to "esm" and make sure your <script type="module"> tag has type="module" set.
  minify: true,
  outdir: "./dist",
  sourcemap: "external", // separate .map files instead of inlining
  splitting: false,
  target: "browser", // Changed from "node" to "browser"
});

// The hook builds separately: minification strips the "use client" directive,
// so the banner puts it back for the bundlers that need it.
await build({
  banner: "'use client'",
  drop: ["debugger"],
  entrypoints: ["./src/react.ts"],
  env: "disable",
  external: ["@specify-sh/core", "react"],
  footer: `
      /* Built with ❤️ by Specify team */
    `,
  format: "esm",
  minify: true,
  outdir: "./dist",
  sourcemap: "external",
  splitting: false,
  target: "browser",
});

console.log("✅ Build completed successfully");
