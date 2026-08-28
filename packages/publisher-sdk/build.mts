import { execSync } from "node:child_process";
import {
  cpSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  entrypoints: ["./src/index.ts", "./src/server.ts", "./src/react-server.ts"],
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

// The core package is never published, so declarations and source maps cannot reference it.
cpSync("../core/dist", "dist/_core", { recursive: true });
for (const file of readdirSync("dist").filter(
  (name) => name.endsWith(".d.ts") || name.endsWith(".map")
)) {
  const path = `dist/${file}`;
  writeFileSync(
    path,
    readFileSync(path, "utf8").replaceAll("@specify-sh/core", "./_core/index")
  );
}

console.log("✅ Build completed successfully");
