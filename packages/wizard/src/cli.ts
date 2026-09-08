import { readFile } from "node:fs/promises";
import process from "node:process";
import { anyAgentSeam } from "./agent";
import { startUi } from "./ui/host";
import { runWizard } from "./wizard";

const ADVERTISER_GUIDE =
  "https://docs.specify.sh/advertising/analytics-sdk-setup";
const PUBLISHER_GUIDE = "https://docs.specify.sh/publishing/get-started";
const USAGE = `specify-wizard [--publisher] [--verbose]

--advertiser  Not available yet
--verbose     Show the cause of a failure
--help        Show help
--version     Show version`;

type Mode = "publisher" | "advertiser" | "help" | "version";

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

async function runPublisher(verbose: boolean): Promise<number> {
  // Ctrl-C between prompts reaches us as SIGINT, and the agent turn in
  // flight has to be told, or its CLI keeps running after the wizard exits.
  const stopping = new AbortController();
  const stop = () => stopping.abort();
  process.on("SIGINT", stop);
  const ui = startUi({
    input: process.stdin,
    onCancel: stop,
    output: process.stdout,
  });
  try {
    return await runWizard({
      cwd: process.cwd(),
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
    if (mode === "advertiser") {
      process.stderr.write(
        `Advertiser setup is not available yet. Follow ${ADVERTISER_GUIDE} for the current status.\n`
      );
      return 1;
    }
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `The publisher wizard needs a real terminal. To add the SDK by hand, follow ${PUBLISHER_GUIDE}.\n`
      );
      return 1;
    }
    return await runPublisher(verbose);
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
