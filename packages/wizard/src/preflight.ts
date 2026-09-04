import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TreeState =
  | { kind: "clean" }
  | { kind: "dirty"; changedFiles: number }
  | { kind: "not-a-repo" };

export async function inspectWorkingTree(cwd: string): Promise<TreeState> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
    });
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1"],
      { cwd }
    );
    const files = stdout.trim().split("\n").filter(Boolean);
    return files.length === 0
      ? { kind: "clean" }
      : { changedFiles: files.length, kind: "dirty" };
  } catch {
    return { kind: "not-a-repo" };
  }
}

function untrackedFiles(status: string): string[] {
  return status
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3));
}

/**
 * What the agent left behind, as `git diff --stat` plus the new files.
 *
 * A file the agent creates is untracked, so `git diff --stat` alone would not
 * mention the very files an integration adds. Git failing here is reported in
 * the summary rather than thrown, because by this point the work has landed
 * and the developer still needs to be told where to look.
 *
 * @param cwd The project the agent worked in.
 * @returns A summary to show the developer, never empty.
 */
export async function summarizeChanges(cwd: string): Promise<string> {
  let diff: string;
  let untracked: string[];
  try {
    const [diffResult, statusResult] = await Promise.all([
      execFileAsync("git", ["diff", "--stat"], { cwd }),
      execFileAsync("git", ["status", "--porcelain=v1"], { cwd }),
    ]);
    diff = diffResult.stdout.trim();
    untracked = untrackedFiles(statusResult.stdout);
  } catch {
    return "Could not run git here. Review the changes with your own tools before running anything.";
  }

  const sections = [
    ...(diff ? [diff] : []),
    ...(untracked.length > 0
      ? [`New files, not yet tracked by Git:\n${untracked.join("\n")}`]
      : []),
  ];
  return sections.length === 0 ? "No files changed." : sections.join("\n\n");
}
