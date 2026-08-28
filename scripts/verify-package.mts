import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "specify-package-"));

type PackageManifest = Partial<
  Record<
    "dependencies" | "optionalDependencies" | "peerDependencies" | "scripts",
    Record<string, string>
  >
>;

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

  const distDirectory = join(packageDirectory, "dist");
  const leakedCoreReference = filesUnder(distDirectory).find((path) =>
    readFileSync(path, "utf8").includes("@specify-sh/core")
  );
  if (leakedCoreReference) {
    throw new Error(`Private core reference found in ${leakedCoreReference}`);
  }
  console.log("Verified dist contains no @specify-sh/core references");

  const manifest: PackageManifest = JSON.parse(
    readFileSync(join(packageDirectory, "package.json"), "utf8")
  );
  const privateRuntimeDependency = [
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ]
    .flatMap((dependencies) => Object.keys(dependencies ?? {}))
    .find((name) => name.startsWith("@specify-sh/"));
  if (privateRuntimeDependency) {
    throw new Error(
      `Private runtime dependency found: ${privateRuntimeDependency}`
    );
  }
  if (manifest.scripts?.prepack || manifest.scripts?.postpack) {
    throw new Error(
      "Packed package must not rewrite its manifest in pack scripts"
    );
  }
  console.log(
    "Verified the packed manifest has no private runtime dependencies or pack scripts"
  );

  writeFileSync(
    join(scratch, "consumer.ts"),
    `import Specify, { type Address, ImageFormat, type ImageFormat as ImageFormatType, type SpecifyAd, type SpecifyInitConfig, ValidationError } from "@specify-sh/publisher-sdk";
import { type Address as ServerAddress, ImageFormat as ServerImageFormat, type ImageFormat as ServerImageFormatType, serve, type ServeOptions, type SpecifyAd as ServerSpecifyAd, ValidationError as ServerValidationError, type ValidationError as ServerValidationErrorType } from "@specify-sh/publisher-sdk/server";
const address: Address = "0x1234567890123456789012345678901234567890";
const config: SpecifyInitConfig = { publisherKey: "spk_1234567890abcdef1234567890abcd" };
const client: Specify = new Specify(config);
const imageFormat: ImageFormatType = ImageFormat.LANDSCAPE;
const ad: Promise<SpecifyAd | null> = client.serve(address, { imageFormat });
const serverAddress: ServerAddress = address;
const serverImageFormat: ServerImageFormatType = ServerImageFormat.LANDSCAPE;
const serverOptions: ServeOptions = { publisherKey: config.publisherKey, walletAddresses: [serverAddress], imageFormat: serverImageFormat };
const serverAd: Promise<ServerSpecifyAd | null> = serve(serverOptions);
function validationMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    const validation: ValidationError = error;
    return validation.message;
  }
  return "";
}
function serverValidationMessage(error: unknown): string {
  if (error instanceof ServerValidationError) {
    const validation: ServerValidationErrorType = error;
    return validation.message;
  }
  return "";
}
void ad;
void serverAd;
void validationMessage;
void serverValidationMessage;
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

  const guardMessage = execFileSync(
    "node",
    [
      "--conditions=react-server",
      "-e",
      'import("@specify-sh/publisher-sdk").then(() => process.exit(1)).catch((error) => { console.log(error.message); })',
    ],
    { cwd: scratch, encoding: "utf8" }
  ).trim();
  if (!guardMessage.includes("@specify-sh/publisher-sdk/server")) {
    throw new Error(
      `React Server Component guard did not name /server: ${guardMessage}`
    );
  }
  console.log(
    "Verified the react-server condition directs consumers to /server"
  );

  execFileSync(
    "node",
    [
      "-e",
      'import("@specify-sh/publisher-sdk").then((module) => { if (typeof module.default !== "function") process.exit(1); })',
    ],
    { cwd: scratch, stdio: "inherit" }
  );
  console.log("Verified the default condition exposes the browser entry");
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
