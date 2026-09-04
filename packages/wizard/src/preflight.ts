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
