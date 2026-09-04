import { readFile } from "node:fs/promises";
import process from "node:process";
import { intro, log, note, outro } from "@clack/prompts";
import { anyAgentSeam } from "./agent";
import { runWizard } from "./wizard";

const ADVERTISER_GUIDE =
  "https://docs.specify.sh/advertising/analytics-sdk-setup";

type Mode = "publisher" | "advertiser" | "help" | "version";

function parseArgs(argv: string[]): Mode {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--publisher")) {
    return "publisher";
  }
  if (argv.length === 1 && argv[0] === "--advertiser") {
    return "advertiser";
  }
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return "help";
  }
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v")) {
    return "version";
  }
  throw new Error("Use --publisher, --advertiser, --help, or --version.");
}

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );
  return typeof manifest.version === "string" ? manifest.version : "unknown";
}

async function runCli(): Promise<number> {
  const io = { input: process.stdin, output: process.stdout };
  try {
    const mode = parseArgs(process.argv.slice(2));
    if (mode === "help") {
      note(
        "specify-wizard [--publisher]\n\n--advertiser  Not available yet\n--help        Show help\n--version     Show version",
        "Usage",
        io
      );
      return 0;
    }
    if (mode === "version") {
      outro(await packageVersion(), io);
      return 0;
    }
    if (mode === "advertiser") {
      intro("Specify publisher SDK wizard", io);
      log.error(
        `Advertiser setup is not available yet. Follow ${ADVERTISER_GUIDE} for the current status.`,
        io
      );
      return 1;
    }
    return await runWizard({
      cwd: process.cwd(),
      ...io,
      seam: anyAgentSeam(),
    });
  } catch (error) {
    log.error(
      error instanceof Error
        ? error.message
        : "The wizard could not start. Check your setup and try again.",
      io
    );
    return 1;
  }
}

process.exitCode = await runCli();
