import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { vi } from "vitest";

// Without these, a test folder belongs to any repository TMPDIR sits in, and
// the developer's own git config can change what `git status` reports.
const ISOLATED = {
  GIT_CEILING_DIRECTORIES: realpathSync(tmpdir()),
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: "1",
};

// A git hook running the suite sets GIT_DIR and the like, which would point
// git at the outer repository.
export function git(cwd: string, args: string[]): void {
  const inherited = Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_")
  );
  execFileSync("git", args, {
    cwd,
    env: { ...Object.fromEntries(inherited), ...ISOLATED },
    stdio: "ignore",
  });
}

export function isolateGit(): void {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("GIT_")) {
      vi.stubEnv(name, undefined);
    }
  }
  for (const [name, value] of Object.entries(ISOLATED)) {
    vi.stubEnv(name, value);
  }
}
