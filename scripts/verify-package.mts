import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "specify-package-"));

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

try {
  const tarball = execFileSync(
    "bun",
    ["pm", "pack", "--destination", scratch, "--quiet"],
    { cwd: "packages/publisher-sdk", encoding: "utf8" }
  ).trim();

  const packageDirectory = join(
    scratch,
    "node_modules",
    "@specify-sh",
    "publisher-sdk"
  );
  mkdirSync(packageDirectory, { recursive: true });
  execFileSync(
    "tar",
    ["-xzf", tarball, "--strip-components=1", "-C", packageDirectory],
    { stdio: "inherit" }
  );
  console.log("Packed and extracted @specify-sh/publisher-sdk");

  const leakedCoreReference = filesUnder(packageDirectory).find(
    (path) =>
      statSync(path).isFile() &&
      readFileSync(path, "utf8").includes("@specify-sh/core")
  );
  if (leakedCoreReference) {
    throw new Error(`Private core reference found in ${leakedCoreReference}`);
  }
  console.log("Verified the package contains no @specify-sh/core references");

  writeFileSync(
    join(scratch, "consumer.ts"),
    `import Specify, { type Address, ImageFormat, type ImageFormat as ImageFormatType, type SpecifyAd } from "@specify-sh/publisher-sdk";
const address: Address = "0x1234567890123456789012345678901234567890";
const client = new Specify({ publisherKey: "spk_1234567890abcdef1234567890abcd" });
const imageFormat: ImageFormatType = ImageFormat.LANDSCAPE;
const ad: Promise<SpecifyAd | null> = client.serve(address, { imageFormat });
void ad;
`
  );
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        types: [],
      },
      include: ["consumer.ts"],
    })
  );
  execFileSync(
    resolve("node_modules/.bin/tsc"),
    ["--noEmit", "-p", join(scratch, "tsconfig.json")],
    { cwd: scratch, stdio: "inherit" }
  );
  console.log("Type-checked a consumer with only the packed package installed");
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
