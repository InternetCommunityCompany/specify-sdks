import { readFile } from "node:fs/promises";
import process from "node:process";
import { anyAgentSeam } from "./agent";
import { SDK_CONFIG, type SdkMode } from "./sdk";
import { startUi } from "./ui/host";
import { runWizard } from "./wizard";

const USAGE = `Usage: specify-wizard [--publisher | --advertiser] [--verbose]

--publisher   Add the publisher SDK (default)
--advertiser  Add the advertiser SDK
--verbose     Show the cause of a failure
--help        Show help
--version     Show version`;

type Mode = SdkMode | "help" | "version";

interface Args {
  mode: Mode;
  verbose: boolean;
}

const MODES: Record<string, Mode> = {
  "--advertiser": "advertiser",
  "--help": "help",
  "--publisher": "publisher",
  "--version": "version",
  "-h": "help",
  "-v": "version",
};

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "publisher", verbose: false };
  let chosen = false;
  for (const arg of argv) {
    if (arg === "--verbose") {
      args.verbose = true;
      continue;
    }
    const mode = MODES[arg];
    if (!mode || chosen) {
      throw new Error(
        "Use --publisher, --advertiser, --verbose, --help, or --version."
      );
    }
    args.mode = mode;
    chosen = true;
  }
  return args;
}

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  return typeof manifest.version === "string" ? manifest.version : "unknown";
}

async function runIntegration(
  mode: SdkMode,
  verbose: boolean
): Promise<number> {
  // Ctrl-C between prompts reaches us as SIGINT, and the agent turn in
  // flight has to be told, or its CLI keeps running after the wizard exits.
  const stopping = new AbortController();
  const stop = () => stopping.abort();
  process.on("SIGINT", stop);
  const ui = startUi({
    input: process.stdin,
    mode,
    onCancel: stop,
    output: process.stdout,
  });
  try {
    return await runWizard({
      cwd: process.cwd(),
      mode,
      seam: anyAgentSeam(),
      signal: stopping.signal,
      ui,
      verbose,
    });
  } finally {
    process.off("SIGINT", stop);
    await ui.close();
  }
}

async function runCli(): Promise<number> {
  try {
    const { mode, verbose } = parseArgs(process.argv.slice(2));
    if (mode === "help") {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    if (mode === "version") {
      process.stdout.write(`${await packageVersion()}\n`);
      return 0;
    }
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `The ${mode} wizard needs a real terminal. To add the SDK by hand, follow ${SDK_CONFIG[mode].guide}.\n`
      );
      return 1;
    }
    return await runIntegration(mode, verbose);
  } catch (error) {
    process.stderr.write(
      `${
        error instanceof Error
          ? error.message
          : "The wizard could not start. Check your setup and try again."
      }\n`
    );
    return 1;
  }
}

process.exitCode = await runCli();
