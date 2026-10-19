import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "specify-packages-"));
const archivesDirectory = join(scratch, "archives");
const packagesDirectory = join(scratch, "packages");

interface PackageManifest {
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
  main?: string;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  types?: string;
  version?: string;
}

interface PackedPackage {
  directory: string;
  files: string[];
  manifest: PackageManifest;
  tarball: string;
}

function packageFiles(tarball: string): string[] {
  return execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
}

function packPackage(
  packagePath: string,
  directoryName: string
): PackedPackage {
  // npm, not bun: `changeset publish` shells out to `npm publish`, and the
  // two packers disagree — bun rewrites a `workspace:` range to the real
  // version and npm ships it verbatim, which would publish an unresolvable
  // dependency. Verifying bun's tarball would not see that.
  const packedPath = execFileSync(
    "npm",
    ["pack", "--pack-destination", archivesDirectory, "--silent"],
    { cwd: packagePath, encoding: "utf8" }
  ).trim();
  // npm prints the bare filename, not a path.
  const tarball = resolve(archivesDirectory, basename(packedPath));
  const directory = join(packagesDirectory, directoryName);
  mkdirSync(directory, { recursive: true });
  execFileSync(
    "tar",
    ["-xzf", tarball, "--strip-components=1", "-C", directory],
    { stdio: "inherit" }
  );
  const files = packageFiles(tarball);
  const manifest: PackageManifest = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8")
  );
  console.log(`${directoryName} tarball files:\n${files.join("\n")}`);
  return { directory, files, manifest, tarball };
}

function requireFile(files: string[], path: string): void {
  if (!files.includes(`package/${path}`)) {
    throw new Error(`Packed package is missing ${path}`);
  }
}

// Under NodeNext, a declaration's relative import resolves only with its .js extension.
function requireResolvableDeclarations(pkg: PackedPackage): void {
  for (const path of pkg.files.filter((file) => file.endsWith(".d.ts"))) {
    const source = readFileSync(
      join(pkg.directory, path.replace("package/", "")),
      "utf8"
    );
    const bare = [...source.matchAll(/(?:from |import\()"(\.\.?\/[^"]+)"/g)]
      .map(([, specifier]) => specifier)
      .filter((specifier) => !specifier.endsWith(".js"));
    if (bare.length > 0) {
      throw new Error(
        `${pkg.manifest.name} ${path} imports ${bare.join(", ")} without a .js extension`
      );
    }
  }
}

try {
  mkdirSync(archivesDirectory, { recursive: true });
  mkdirSync(packagesDirectory, { recursive: true });

  const core = packPackage("packages/core", "core");
  const publisher = packPackage("packages/publisher-sdk", "publisher-sdk");
  const advertiser = packPackage("packages/advertiser-sdk", "advertiser-sdk");
  const wizard = packPackage("packages/wizard", "wizard");

  for (const pkg of [core, publisher, advertiser]) {
    requireResolvableDeclarations(pkg);
  }
  console.log("Verified declarations resolve under NodeNext");

  for (const file of [
    "dist/index.js",
    "dist/index.js.map",
    "dist/index.d.ts",
    "dist/index.d.ts.map",
    "dist/server.js",
    "dist/server.js.map",
    "dist/server.d.ts",
    "dist/server.d.ts.map",
    "dist/react-server.js",
    "README.md",
    "LICENSE",
  ]) {
    requireFile(advertiser.files, file);
  }
  if (advertiser.files.some((path) => path.startsWith("package/src/"))) {
    throw new Error("Advertiser tarball must not contain source files");
  }

  requireFile(core.files, "dist/index.js");
  requireFile(core.files, "dist/index.js.map");
  requireFile(core.files, "dist/index.d.ts");
  requireFile(core.files, "dist/index.d.ts.map");
  if (core.files.some((path) => path.startsWith("package/src/"))) {
    throw new Error("Core tarball must not contain source files");
  }
  if (
    core.manifest.main !== "dist/index.js" ||
    core.manifest.types !== "dist/index.d.ts" ||
    JSON.stringify(core.manifest.exports).includes("/src/")
  ) {
    throw new Error(
      "Core manifest must expose built JavaScript and declarations"
    );
  }
  console.log("Verified @specify-sh/core exposes built artifacts only");

  const coreDependency = publisher.manifest.dependencies?.["@specify-sh/core"];
  if (!coreDependency || coreDependency !== core.manifest.version) {
    throw new Error(
      `Publisher must depend on the packed core version, found ${coreDependency ?? "nothing"}`
    );
  }
  for (const dependencies of [
    publisher.manifest.devDependencies,
    publisher.manifest.peerDependencies,
    publisher.manifest.optionalDependencies,
  ]) {
    if (dependencies?.["@specify-sh/core"]) {
      throw new Error(
        "Publisher must declare @specify-sh/core only in dependencies"
      );
    }
  }
  if (
    publisher.manifest.scripts?.prepack ||
    publisher.manifest.scripts?.postpack
  ) {
    throw new Error("Publisher must not mutate its manifest in pack scripts");
  }
  if (publisher.files.some((path) => path.startsWith("package/dist/_core/"))) {
    throw new Error("Publisher tarball must not contain dist/_core");
  }
  console.log(
    `Verified publisher dependency on @specify-sh/core@${coreDependency}`
  );

  const advertiserCore = advertiser.manifest.dependencies?.["@specify-sh/core"];
  if (advertiserCore !== core.manifest.version) {
    throw new Error(
      `Advertiser must depend on the packed core version, found ${advertiserCore ?? "nothing"}`
    );
  }
  if (
    advertiser.manifest.devDependencies?.["@specify-sh/core"] ||
    advertiser.manifest.peerDependencies?.["@specify-sh/core"] ||
    advertiser.manifest.optionalDependencies?.["@specify-sh/core"] ||
    advertiser.manifest.scripts?.prepack ||
    advertiser.manifest.scripts?.postpack
  ) {
    throw new Error(
      "Advertiser must declare core only in dependencies and must not use pack scripts"
    );
  }
  for (const file of ["index.js", "server.js", "index.d.ts", "server.d.ts"]) {
    const path = join(advertiser.directory, "dist", file);
    if (!readFileSync(path, "utf8").includes("@specify-sh/core")) {
      throw new Error(
        `Advertiser ${file} must retain its @specify-sh/core import`
      );
    }
  }
  if (
    readFileSync(
      join(advertiser.directory, "dist", "react-server.js"),
      "utf8"
    ).includes("@specify-sh/core")
  ) {
    throw new Error("The advertiser react-server guard must not import core");
  }
  console.log(
    `Verified advertiser dependency on @specify-sh/core@${advertiserCore}`
  );

  for (const file of ["index.js", "server.js", "index.d.ts", "server.d.ts"]) {
    const path = join(publisher.directory, "dist", file);
    if (!readFileSync(path, "utf8").includes("@specify-sh/core")) {
      throw new Error(`${file} must retain its @specify-sh/core import`);
    }
  }
  const reactServer = readFileSync(
    join(publisher.directory, "dist", "react-server.js"),
    "utf8"
  );
  if (reactServer.includes("@specify-sh/core")) {
    throw new Error("The react-server guard must not import core");
  }
  console.log("Verified publisher JavaScript and declarations import core");

  for (const file of [
    "react.js",
    "react.js.map",
    "react.d.ts",
    "react.react-server.js",
  ]) {
    requireFile(publisher.files, `dist/${file}`);
  }
  const reactHook = readFileSync(
    join(publisher.directory, "dist", "react.js"),
    "utf8"
  );
  if (!reactHook.startsWith("'use client'")) {
    throw new Error(
      "The packed react.js must open with the use client directive"
    );
  }
  if (!reactHook.includes('from"react"')) {
    throw new Error("The packed react.js must import react, not bundle it");
  }
  if (reactHook.includes("@specify-sh/core")) {
    throw new Error("The react hook must not bundle a core import");
  }
  if (publisher.manifest.peerDependencies?.react !== "^18 || ^19") {
    throw new Error("Publisher must declare react as an optional peer");
  }
  console.log("Verified the react entry keeps its directive and externals");

  requireFile(wizard.files, "dist/cli.js");
  requireFile(wizard.files, "dist/cli.js.map");
  if (wizard.files.some((path) => path.startsWith("package/src/"))) {
    throw new Error("Wizard tarball must not contain source files");
  }
  if (wizard.manifest.bin?.["specify-wizard"] !== "./dist/cli.js") {
    throw new Error("Wizard manifest must expose the built CLI");
  }
  const wizardCli = readFileSync(
    join(wizard.directory, "dist", "cli.js"),
    "utf8"
  );
  if (!wizardCli.startsWith("#!/usr/bin/env node")) {
    throw new Error("The packed wizard CLI must start with a Node shebang");
  }
  for (const dependency of [
    "anyagent-js",
    "giggles",
    "ink",
    "ink-text-input",
    "react",
  ]) {
    if (!wizard.manifest.dependencies?.[dependency]) {
      throw new Error(`Wizard must declare ${dependency} in dependencies`);
    }
    if (
      wizard.manifest.devDependencies?.[dependency] ||
      wizard.manifest.peerDependencies?.[dependency]
    ) {
      throw new Error(`Wizard must declare ${dependency} only in dependencies`);
    }
    if (!wizardCli.includes(dependency)) {
      throw new Error(`Wizard CLI must retain its ${dependency} import`);
    }
  }
  console.log("Verified the wizard CLI artifact and runtime dependencies");

  const wizardConsumerDirectory = join(scratch, "wizard-consumer");
  mkdirSync(wizardConsumerDirectory, { recursive: true });
  writeFileSync(
    join(wizardConsumerDirectory, "package.json"),
    JSON.stringify({
      dependencies: {
        "@specify-sh/wizard": `file:${wizard.tarball}`,
      },
      private: true,
    })
  );
  execFileSync("npm", ["install", "--ignore-scripts"], {
    cwd: wizardConsumerDirectory,
    stdio: "inherit",
  });
  const wizardHelp = execFileSync(
    join(wizardConsumerDirectory, "node_modules/.bin/specify-wizard"),
    ["--help"],
    { cwd: wizardConsumerDirectory, encoding: "utf8" }
  );
  if (!wizardHelp.includes("Usage")) {
    throw new Error(
      "The installed wizard must print usage through its bin shim"
    );
  }
  if (!wizardHelp.includes("--advertiser  Add the advertiser SDK")) {
    throw new Error("The installed wizard must advertise advertiser setup");
  }
  for (const args of [[], ["--publisher"], ["--advertiser"]]) {
    const advertiserMode = args.includes("--advertiser");
    const guide = advertiserMode
      ? "https://docs.specify.sh/advertising/javascript"
      : "https://docs.specify.sh/publishing/get-started";
    try {
      execFileSync(
        join(wizardConsumerDirectory, "node_modules/.bin/specify-wizard"),
        args,
        {
          cwd: wizardConsumerDirectory,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 3000,
        }
      );
      throw new Error("The installed wizard must reject closed stdin");
    } catch (error) {
      if (
        !(error instanceof Error && "status" in error) ||
        error.status !== 1 ||
        !("stderr" in error) ||
        typeof error.stderr !== "string" ||
        !error.stderr.includes("needs a real terminal") ||
        !error.stderr.includes(guide)
      ) {
        throw error;
      }
    }
  }
  console.log("Verified the installed wizard runs through its bin shim");

  const consumerDirectory = join(scratch, "consumer");
  mkdirSync(consumerDirectory, { recursive: true });
  const rootManifest: PackageManifest = JSON.parse(
    readFileSync("package.json", "utf8")
  );
  const reactVersion = rootManifest.devDependencies?.react;
  const reactTypesVersion = rootManifest.devDependencies?.["@types/react"];
  if (!(reactVersion && reactTypesVersion)) {
    throw new Error("The repo devDependencies must pin react and @types/react");
  }
  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify({
      dependencies: {
        "@specify-sh/advertiser-sdk": `file:${advertiser.tarball}`,
        "@specify-sh/core": `file:${core.tarball}`,
        "@specify-sh/publisher-sdk": `file:${publisher.tarball}`,
        "@types/react": reactTypesVersion,
        react: reactVersion,
      },
      overrides: {
        "@specify-sh/core": `file:${core.tarball}`,
      },
      private: true,
      type: "module",
    })
  );
  execFileSync("bun", ["install", "--ignore-scripts"], {
    cwd: consumerDirectory,
    stdio: "inherit",
  });
  console.log("Installed SDK tarballs into an empty consumer");

  writeFileSync(
    join(consumerDirectory, "consumer.ts"),
    `import { type AdRequest, type Address as CoreAddress, assertValidAddresses, assertValidPublisherKey, ImageFormat as CoreImageFormat, type ImageFormat as CoreImageFormatType, MAX_WALLET_ADDRESSES, prepareWalletAddresses, requestAd, type SpecifyAd as CoreSpecifyAd, ValidationError as CoreValidationError, type ValidationError as CoreValidationErrorType } from "@specify-sh/core";
import Specify, { type Address, ImageFormat, type ImageFormat as ImageFormatType, type SpecifyAd, type SpecifyInitConfig, ValidationError } from "@specify-sh/publisher-sdk";
import { type Address as ServerAddress, ImageFormat as ServerImageFormat, type ImageFormat as ServerImageFormatType, serve, type ServeOptions, type SpecifyAd as ServerSpecifyAd, ValidationError as ServerValidationError, type ValidationError as ServerValidationErrorType } from "@specify-sh/publisher-sdk/server";
import { useSpecifyAd, type UseSpecifyAdOptions } from "@specify-sh/publisher-sdk/react";
import Advertiser, { type Address as AdvertiserAddress, type SpecifyInitConfig as AdvertiserInitConfig } from "@specify-sh/advertiser-sdk";
import { type Address as AdvertiserServerAddress, type CaptureOptions as AdvertiserCaptureOptions, capture as advertiserCapture, ValidationError as AdvertiserValidationError, type ValidationError as AdvertiserValidationErrorType } from "@specify-sh/advertiser-sdk/server";
const advertiserConfig: AdvertiserInitConfig = { advertiserKey: "sak_0123456789abcdef0123456789abcd" };
const advertiserClient = new Advertiser(advertiserConfig);
const consented: void = advertiserClient.setCookieConsent(true);
const advertiserWallet: AdvertiserAddress = "0x1111111111111111111111111111111111111111";
const identified: void = advertiserClient.identify("customer");
advertiserClient.identify(advertiserWallet);
advertiserClient.identify([advertiserWallet]);
const captured: void = advertiserClient.capture("purchase");
const forgotten: void = advertiserClient.reset();
const advertiserServerWallet: AdvertiserServerAddress = advertiserWallet;
const advertiserCaptureOptions: AdvertiserCaptureOptions = { advertiserKey: advertiserConfig.advertiserKey, dedupeKey: "order_1", event: "purchase", identity: advertiserServerWallet, url: "https://shop.example/purchase" };
const advertiserServerEvent: Promise<void> = advertiserCapture(advertiserCaptureOptions);
function advertiserValidationMessage(error: unknown): string {
  if (error instanceof AdvertiserValidationError) {
    const validation: AdvertiserValidationErrorType = error;
    return validation.message;
  }
  return "";
}
void consented;
void identified;
void captured;
void forgotten;
void advertiserServerEvent;
void advertiserValidationMessage;
const coreAddress: CoreAddress = "0x1234567890123456789012345678901234567890";
const coreImageFormat: CoreImageFormatType = CoreImageFormat.LANDSCAPE;
const coreRequest: AdRequest = { imageFormat: coreImageFormat, publisherKey: "spk_1234567890abcdef1234567890abcd", walletAddresses: [coreAddress] };
const coreAd: Promise<CoreSpecifyAd | null> = requestAd(coreRequest);
const coreValidation: CoreValidationErrorType = new CoreValidationError("message");
assertValidAddresses([coreAddress]);
assertValidPublisherKey(coreRequest.publisherKey);
const prepared: CoreAddress[] = prepareWalletAddresses([coreAddress]);
const cap: number = MAX_WALLET_ADDRESSES;
const address: Address = coreAddress;
const config: SpecifyInitConfig = { publisherKey: coreRequest.publisherKey };
const client: Specify = new Specify(config);
const imageFormat: ImageFormatType = ImageFormat.LANDSCAPE;
const ad: Promise<SpecifyAd | null> = client.serve(address, { imageFormat });
const unsubscribeIdentity: () => void = client.onIdentityChange(() => {
  /* re-serve */
});
unsubscribeIdentity();
const serverAddress: ServerAddress = address;
const serverImageFormat: ServerImageFormatType = ServerImageFormat.LANDSCAPE;
const serverOptions: ServeOptions = { publisherKey: config.publisherKey, walletAddresses: [serverAddress], imageFormat: serverImageFormat };
const serverAd: Promise<ServerSpecifyAd | null> = serve(serverOptions);
const hookOptions: UseSpecifyAdOptions = { adUnitId: "header", imageFormat, specify: client };
function AdSlot(): SpecifyAd | null {
  return useSpecifyAd(hookOptions);
}
function WalletAdSlot(): SpecifyAd | null {
  return useSpecifyAd([address], hookOptions);
}
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
void coreAd;
void coreValidation;
void prepared;
void cap;
void ad;
void unsubscribeIdentity;
void serverAd;
void validationMessage;
void serverValidationMessage;
void AdSlot;
void WalletAdSlot;
`
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
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
    ["--noEmit", "-p", join(consumerDirectory, "tsconfig.json")],
    { cwd: consumerDirectory, stdio: "inherit" }
  );
  console.log("Type-checked direct core, browser, and server imports");

  writeFileSync(
    join(consumerDirectory, "nodenext.ts"),
    `import Advertiser from "@specify-sh/advertiser-sdk";
import {
  type CaptureOptions,
  capture,
  ValidationError as AdvertiserValidationError,
} from "@specify-sh/advertiser-sdk/server";
import Publisher, {
  ImageFormat,
  type SpecifyAd,
  ValidationError as PublisherValidationError,
} from "@specify-sh/publisher-sdk";
import { serve } from "@specify-sh/publisher-sdk/server";

type IsAny<T> = 0 extends 1 & T ? true : false;
const typed: [
  IsAny<Advertiser>,
  IsAny<CaptureOptions>,
  IsAny<ReturnType<typeof capture>>,
  IsAny<AdvertiserValidationError>,
  IsAny<Publisher>,
  IsAny<SpecifyAd>,
  IsAny<typeof ImageFormat>,
  IsAny<PublisherValidationError>,
  IsAny<ReturnType<typeof serve>>,
] = [false, false, false, false, false, false, false, false, false];
void typed;
`
  );
  writeFileSync(
    join(consumerDirectory, "server-only.ts"),
    `import { capture } from "@specify-sh/advertiser-sdk/server";
import { serve } from "@specify-sh/publisher-sdk/server";

void capture;
void serve;
`
  );
  for (const [name, compilerOptions, file] of [
    [
      "NodeNext",
      {
        lib: ["ES2022", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
      },
      "nodenext.ts",
    ],
    [
      "server entries without the DOM library",
      { lib: ["ES2022"], module: "NodeNext", moduleResolution: "NodeNext" },
      "server-only.ts",
    ],
  ] as const) {
    const project = join(consumerDirectory, `tsconfig.${file}.json`);
    writeFileSync(
      project,
      JSON.stringify({
        compilerOptions: { ...compilerOptions, strict: true, types: [] },
        files: [file],
      })
    );
    execFileSync(
      resolve("node_modules/.bin/tsc"),
      ["--noEmit", "-p", project],
      {
        cwd: consumerDirectory,
        stdio: "inherit",
      }
    );
    console.log(`Type-checked the packed packages under ${name}`);
  }

  execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import * as core from "@specify-sh/core";
import Specify, * as browser from "@specify-sh/publisher-sdk";
import * as server from "@specify-sh/publisher-sdk/server";
import * as advertiser from "@specify-sh/advertiser-sdk";
import * as advertiserServer from "@specify-sh/advertiser-sdk/server";
const sameKeys = (actual, expected) => JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(expected);
if (!sameKeys(advertiser, ["default"])) process.exit(1);
if (!sameKeys(advertiserServer, ["ValidationError", "capture"])) process.exit(1);
if (advertiserServer.ValidationError !== core.ValidationError) process.exit(1);
let serverRequest;
let serverUrl;
let advertiserRequests = 0;
globalThis.fetch = async (url, request) => { advertiserRequests++; serverUrl = url; serverRequest = request; return new Response(null, { status: 204 }); };
if (await advertiserServer.capture({ advertiserKey: "sak_0123456789abcdef0123456789abcd", event: "purchase", identity: " Customer " }) !== undefined) process.exit(1);
if (serverUrl !== "https://spfsrv.com/v1/events" || "credentials" in serverRequest || "keepalive" in serverRequest) process.exit(1);
const serverBody = JSON.parse(serverRequest.body);
if (!sameKeys(serverBody, ["events", "identity", "source"]) || serverBody.source !== "server" || serverBody.identity !== " Customer " || !sameKeys(serverBody.events[0], ["id", "name"]) || serverBody.events[0].name !== "purchase") process.exit(1);
const rejection = await advertiserServer.capture({ advertiserKey: "advertiser-test-key", event: "purchase", identity: "customer" }).then(() => null, (error) => error);
if (!(rejection instanceof core.ValidationError) || advertiserRequests !== 1) process.exit(1);
if (!sameKeys(core, ["ImageFormat", "MAX_WALLET_ADDRESSES", "ValidationError", "assertValidAddresses", "assertValidPublisherKey", "prepareWalletAddresses", "requestAd"])) process.exit(1);
if (!sameKeys(browser, ["ImageFormat", "ValidationError", "default"])) process.exit(1);
if (!sameKeys(server, ["ImageFormat", "ValidationError", "serve"])) process.exit(1);
if (typeof Specify !== "function" || typeof server.serve !== "function") process.exit(1);
if (browser.ImageFormat !== core.ImageFormat || server.ImageFormat !== core.ImageFormat) process.exit(1);
if (browser.ValidationError !== core.ValidationError || server.ValidationError !== core.ValidationError) process.exit(1);`,
    ],
    { cwd: consumerDirectory, stdio: "inherit" }
  );
  console.log("Verified runtime exports and shared core identity");

  writeFileSync(
    join(consumerDirectory, "advertiser-browser.ts"),
    `import Advertiser from "@specify-sh/advertiser-sdk";
const advertiserClient = new Advertiser({ advertiserKey: "sak_0123456789abcdef0123456789abcd" });
advertiserClient.setCookieConsent(true);
advertiserClient.identify("customer");
advertiserClient.capture("purchase");`
  );
  execFileSync(
    "bun",
    [
      "build",
      "advertiser-browser.ts",
      "--target=browser",
      "--outfile=advertiser-browser.js",
    ],
    { cwd: consumerDirectory, stdio: "inherit" }
  );
  execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const dom = new JSDOM("", { runScripts: "outside-only", url: "https://shop.example/?spclk=secret" });
const browserRequests = [];
dom.window.TextEncoder = TextEncoder;
dom.window.fetch = async (url, request) => { browserRequests.push({ request, url }); return { status: 204 }; };
try {
  dom.window.eval(readFileSync(process.argv[1], "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (JSON.stringify(browserRequests.map(({ url }) => url)) !== JSON.stringify(["https://spfsrv.com/v1/identify", "https://spfsrv.com/v1/identify", "https://spfsrv.com/v1/events"])) process.exit(1);
  if (browserRequests.some(({ request }) => request.credentials !== "include")) process.exit(1);
  const body = JSON.parse(browserRequests[2].request.body);
  if (body.cookieConsent !== true || body.spclk !== "secret" || body.userId !== "customer" || body.source !== "browser" || new URL(body.events[0].url).searchParams.get("spclk") !== "secret") process.exit(1);
  if (!dom.window.location.search.includes("spclk")) process.exit(1);
} finally {
  dom.window.close();
}`,
      join(consumerDirectory, "advertiser-browser.js"),
    ],
    { stdio: "inherit" }
  );
  console.log("Verified packed advertiser SDK in Node and a browser bundle");

  const guardMessage = execFileSync(
    "node",
    [
      "--conditions=react-server",
      "-e",
      'import("@specify-sh/publisher-sdk").then(() => process.exit(1)).catch((error) => { console.log(error.message); })',
    ],
    { cwd: consumerDirectory, encoding: "utf8" }
  ).trim();
  if (
    guardMessage !==
    '@specify-sh/publisher-sdk cannot be imported from a React Server Component. Import { serve } from "@specify-sh/publisher-sdk/server" instead.'
  ) {
    throw new Error(`Unexpected react-server guard: ${guardMessage}`);
  }
  const advertiserGuardMessage = execFileSync(
    "node",
    [
      "--conditions=react-server",
      "-e",
      'import("@specify-sh/advertiser-sdk").then(() => process.exit(1)).catch((error) => { console.log(error.message); }); import("@specify-sh/advertiser-sdk/server").catch(() => process.exit(1));',
    ],
    { cwd: consumerDirectory, encoding: "utf8" }
  ).trim();
  if (
    advertiserGuardMessage !==
    '@specify-sh/advertiser-sdk cannot be imported from a React Server Component. Import { capture } from "@specify-sh/advertiser-sdk/server" instead.'
  ) {
    throw new Error(`Unexpected react-server guard: ${advertiserGuardMessage}`);
  }
  console.log("Verified default and react-server conditional resolution");

  execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import * as reactEntry from "@specify-sh/publisher-sdk/react";
if (JSON.stringify(Object.keys(reactEntry).sort()) !== JSON.stringify(["useSpecifyAd"])) process.exit(1);
if (typeof reactEntry.useSpecifyAd !== "function") process.exit(1);`,
    ],
    { cwd: consumerDirectory, stdio: "inherit" }
  );

  const reactGuardMessage = execFileSync(
    "node",
    [
      "--conditions=react-server",
      "-e",
      'import("@specify-sh/publisher-sdk/react").then(() => process.exit(1)).catch((error) => { console.log(error.message); })',
    ],
    { cwd: consumerDirectory, encoding: "utf8" }
  ).trim();
  if (
    reactGuardMessage !==
    '@specify-sh/publisher-sdk/react can only be imported from a Client Component. Add "use client" to the component that calls useSpecifyAd(), or import { serve } from "@specify-sh/publisher-sdk/server" to serve during server rendering.'
  ) {
    throw new Error(`Unexpected react-server guard: ${reactGuardMessage}`);
  }
  console.log("Verified react subpath resolution under both conditions");
} finally {
  rmSync(scratch, { force: true, recursive: true });
}
