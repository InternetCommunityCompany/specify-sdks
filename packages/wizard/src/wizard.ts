import type { Readable, Writable } from "node:stream";
import { intro, log, note, outro } from "@clack/prompts";
import type { AgentSeam } from "./agent";
import { inspectWorkingTree } from "./preflight";

const PUBLISHER_GUIDE = "https://docs.specify.sh/publishing/get-started";

export interface WizardOptions {
  cwd: string;
  fetchImpl?: typeof fetch;
  input: Readable;
  output: Writable;
  seam: AgentSeam;
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

export async function runWizard(options: WizardOptions): Promise<number> {
  const { cwd, input, output, seam } = options;
  const io = { input, output };
  try {
    intro("Specify publisher SDK wizard", io);
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
