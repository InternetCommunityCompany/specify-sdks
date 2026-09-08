import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PLACEHOLDER_PUBLISHER_KEY } from "./prompts";

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
      ["status", "--porcelain=v1", "-uall"],
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
 * mention the very files an integration adds. Untracked files are listed one
 * by one rather than collapsed into the directory holding them, because
 * "lib/" does not tell a reviewer which files to open. Git failing here is reported in
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
      execFileAsync("git", ["status", "--porcelain=v1", "-uall"], { cwd }),
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

/** A file we cannot read is a file we cannot vouch for. */
async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * The env files the agent left the placeholder key in.
 *
 * Env files are usually gitignored, so `git status` never mentions them and
 * the developer would be told to edit a file nobody named. Only the top level
 * is searched, which is where every framework this SDK supports reads them.
 *
 * @param cwd The project the agent worked in.
 * @returns The file names, relative to the project, or none if the search
 * failed or the placeholder is not there.
 */
export async function envFilesWithPlaceholder(cwd: string): Promise<string[]> {
  let names: string[];
  try {
    names = (await readdir(cwd)).filter((name) => name.startsWith(".env"));
  } catch {
    return [];
  }
  const found = await Promise.all(
    names.map(async (name) =>
      (await readText(join(cwd, name))).includes(PLACEHOLDER_PUBLISHER_KEY)
        ? name
        : undefined
    )
  );
  return found.filter((name): name is string => name !== undefined).sort();
}
