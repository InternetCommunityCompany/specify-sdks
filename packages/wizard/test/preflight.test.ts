import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  envFilesWithPlaceholder,
  inspectWorkingTree,
  summarizeChanges,
} from "../src/preflight";

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

function committedRepository(): string {
  const cwd = temporaryDirectory();
  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "wizard@example.com"]);
  git(cwd, ["config", "user.name", "Specify Wizard"]);
  writeFileSync(join(cwd, "tracked.txt"), "content");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-m", "Initial commit"]);
  return cwd;
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

describe("summarizeChanges", () => {
  it("reports edited files and the files the agent created", async () => {
    const cwd = committedRepository();
    writeFileSync(join(cwd, "tracked.txt"), "edited");
    writeFileSync(join(cwd, "specify.ts"), "// client");

    const summary = await summarizeChanges(cwd);

    expect(summary).toContain("tracked.txt");
    expect(summary).toContain("New files, not yet tracked by Git:\nspecify.ts");
  });

  it("says so when the agent changed nothing", async () => {
    await expect(summarizeChanges(committedRepository())).resolves.toBe(
      "No files changed."
    );
  });

  it("stays useful where git cannot run", async () => {
    await expect(summarizeChanges(temporaryDirectory())).resolves.toContain(
      "Review the changes with your own tools"
    );
  });
});

describe("envFilesWithPlaceholder", () => {
  it("names every env file the placeholder landed in", async () => {
    const cwd = temporaryDirectory();
    writeFileSync(join(cwd, ".env.local"), "KEY=spk_your_key_here\n");
    writeFileSync(join(cwd, ".env"), "KEY=spk_your_key_here\n");
    writeFileSync(join(cwd, ".env.production"), "KEY=spk_live_real\n");
    writeFileSync(join(cwd, "config.ts"), "spk_your_key_here\n");

    await expect(envFilesWithPlaceholder(cwd)).resolves.toEqual([
      ".env",
      ".env.local",
    ]);
  });

  it("finds nothing when no env file holds the placeholder", async () => {
    const cwd = temporaryDirectory();
    writeFileSync(join(cwd, ".env"), "KEY=spk_live_real\n");

    await expect(envFilesWithPlaceholder(cwd)).resolves.toEqual([]);
  });

  it("reports nothing rather than throwing when the directory is gone", async () => {
    await expect(
      envFilesWithPlaceholder(join(tmpdir(), "specify-wizard-missing"))
    ).resolves.toEqual([]);
  });
});
