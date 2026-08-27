import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { rollup } from "rollup";
import dts from "rollup-plugin-dts";

// Ensure a clean state for the new build output
rmSync(resolve(process.cwd(), "dist"), { force: true, recursive: true });
rmSync(resolve(process.cwd(), ".declarations"), { force: true, recursive: true });

// First, generate TypeScript declarations
console.log("Generating TypeScript declarations...");
execSync("bun run tsc --emitDeclarationOnly --outDir .declarations -p tsconfig.build.json", { stdio: "inherit" });

const declarationBundle = await rollup({
  input: resolve(process.cwd(), ".declarations/index.d.ts"),
  plugins: [dts()],
});
await declarationBundle.write({
  file: resolve(process.cwd(), "dist/index.d.ts"),
  format: "es",
  sourcemap: true,
});
await declarationBundle.close();
rmSync(resolve(process.cwd(), ".declarations"), { force: true, recursive: true });

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
