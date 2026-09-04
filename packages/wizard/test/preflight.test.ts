import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectWorkingTree } from "../src/preflight";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "specify-wizard-"));
  directories.push(directory);
  return directory;
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("inspectWorkingTree", () => {
  it("reports a staged file in a fresh repository", async () => {
    const cwd = temporaryDirectory();
    git(cwd, ["init"]);
    writeFileSync(join(cwd, "tracked.txt"), "content");
    git(cwd, ["add", "tracked.txt"]);

    await expect(inspectWorkingTree(cwd)).resolves.toEqual({
      changedFiles: 1,
      kind: "dirty",
    });
  });

  it("reports a committed repository as clean", async () => {
    const cwd = temporaryDirectory();
    git(cwd, ["init"]);
    git(cwd, ["config", "user.email", "wizard@example.com"]);
    git(cwd, ["config", "user.name", "Specify Wizard"]);
    writeFileSync(join(cwd, "tracked.txt"), "content");
    git(cwd, ["add", "tracked.txt"]);
    git(cwd, ["commit", "-m", "Initial commit"]);

    await expect(inspectWorkingTree(cwd)).resolves.toEqual({ kind: "clean" });
  });

  it("reports a plain directory as not a repository", async () => {
    await expect(inspectWorkingTree(temporaryDirectory())).resolves.toEqual({
      kind: "not-a-repo",
    });
  });
});
