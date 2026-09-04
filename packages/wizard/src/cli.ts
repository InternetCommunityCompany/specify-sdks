import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { intro, log, note, outro } from "@clack/prompts";
import { type AgentSeam, anyAgentSeam } from "./agent";
import { inspectWorkingTree } from "./preflight";

const ADVERTISER_GUIDE =
  "https://docs.specify.sh/advertising/analytics-sdk-setup";
const PUBLISHER_GUIDE = "https://docs.specify.sh/publishing/get-started";

export interface WizardIo {
  input: Readable;
  output: Writable;
}

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

function describeTree(
  state: Awaited<ReturnType<typeof inspectWorkingTree>>
): string {
  if (state.kind === "clean") {
    return "Working tree: clean";
  }
  if (state.kind === "dirty") {
    return `Working tree: ${state.changedFiles} changed ${state.changedFiles === 1 ? "file" : "files"}`;
  }
  return "Working tree: not a Git repository";
}

export async function runWizard(
  argv: string[],
  io: WizardIo,
  seam: AgentSeam = anyAgentSeam(),
  cwd = process.cwd()
): Promise<number> {
  try {
    const mode = parseArgs(argv);
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

    intro("Specify publisher SDK wizard", io);
    if (mode === "advertiser") {
      log.error(
        `Advertiser setup is not available yet. Follow ${ADVERTISER_GUIDE} for the current status.`,
        io
      );
      return 1;
    }

    const agents = await seam.detect();
    if (agents.length === 0) {
      log.error(
        `No supported coding agent was found. Use the manual guide: ${PUBLISHER_GUIDE}`,
        io
      );
      return 1;
    }

    const [selected] = agents;
    if (!selected) {
      return 1;
    }
    if (agents.length > 1) {
      log.info(
        `Found ${agents.length} coding agents; using ${selected.name}.`,
        io
      );
    } else {
      log.info(`Found ${selected.name}.`, io);
    }
    const tree = await inspectWorkingTree(cwd);
    note(
      `${selected.name}${selected.version ? ` ${selected.version}` : ""}\n${describeTree(tree)}`,
      "Preflight",
      io
    );
    outro("Preflight complete. Integration planning is coming next.", io);
    return 0;
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

const moduleUrl = new URL(import.meta.url);
const isEntrypoint =
  moduleUrl.protocol === "file:" &&
  process.argv[1] !== undefined &&
  fileURLToPath(moduleUrl) === resolve(process.argv[1]);

if (isEntrypoint) {
  process.exitCode = await runWizard(process.argv.slice(2), {
    input: process.stdin,
    output: process.stdout,
  });
}
