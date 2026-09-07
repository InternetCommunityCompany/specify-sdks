import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AgentConversation, AgentSeam, DetectedAgent } from "../src/agent";
import { runWizard } from "../src/wizard";

const AGENT: DetectedAgent = {
  id: "codex",
  name: "Codex",
  version: "1.2.3",
};
const KEY_PROMPT = "Paste your publisher key";
const PLACEMENT_PROMPT = "Which of these placements";
const REVIEW_PROMPT = "Go ahead with this plan?";
const FEEDBACK_PROMPT = "What should the agent do differently?";
const ENTER = "\r";
const DOWN = "\u001B[B";
const SPACE = " ";
const HERO = "`app/page.tsx` - the hero, above the fold";
const SIDEBAR = "`app/blog/page.tsx` - between the list and the footer";
const PLAN = `## What I found

A Next.js app with the App Router, TypeScript and pnpm.

## What I will change

- Create lib/specify.ts with the shared client.
- Add NEXT_PUBLIC_SPECIFY_PUBLISHER_KEY to .env.local.

## Placements

- ${HERO}
- ${SIDEBAR}

## Notes

Cookiebot already handles consent in app/layout.tsx.`;
const PLAN_WITHOUT_PLACEMENTS = `## What I found

A plain JavaScript site built with esbuild.

## What I will change

- Add the shared client to src/specify.js.`;
const TEST_TIMEOUT = 20_000;

const directories: string[] = [];
let index: string;

beforeAll(async () => {
  index = await readFile(
    resolve("packages/wizard/test/fixtures/llms.txt"),
    "utf8"
  );
});

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function repository(dirty = false): string {
  const cwd = mkdtempSync(join(tmpdir(), "specify-wizard-"));
  directories.push(cwd);
  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "wizard@example.com"]);
  git(cwd, ["config", "user.name", "Specify Wizard"]);
  writeFileSync(join(cwd, "package.json"), '{"name":"host"}\n');
  git(cwd, ["add", "package.json"]);
  git(cwd, ["commit", "-m", "Initial commit"]);
  if (dirty) {
    writeFileSync(
      join(cwd, "package.json"),
      '{"name":"host","private":true}\n'
    );
  }
  return cwd;
}

function plainDirectory(): string {
  const cwd = mkdtempSync(join(tmpdir(), "specify-wizard-"));
  directories.push(cwd);
  return cwd;
}

/**
 * A terminal the test can read and type into. Keys are written once the
 * prompt that consumes them has rendered, so a slow machine cannot make the
 * script land on the wrong prompt.
 */
function terminal() {
  const waiters = new Set<() => void>();
  let captured = "";
  let cursor = 0;
  const input = new PassThrough();
  const output = new Writable({
    write(chunk, _encoding, callback) {
      captured += String(chunk);
      for (const waiter of [...waiters]) {
        waiter();
      }
      callback();
    },
  });

  function waitFor(marker: string): Promise<void> {
    return new Promise((done, fail) => {
      const timer = setTimeout(() => {
        waiters.delete(check);
        fail(new Error(`Never saw "${marker}". Captured:\n${captured}`));
      }, 10_000);
      function check() {
        const found = captured.indexOf(marker, cursor);
        if (found === -1) {
          return;
        }
        cursor = found + marker.length;
        clearTimeout(timer);
        waiters.delete(check);
        done();
      }
      waiters.add(check);
      check();
    });
  }

  return {
    input,
    output,
    text: () => captured,
    async type(marker: string, keys: string) {
      await waitFor(marker);
      input.write(keys);
    },
  };
}

interface FakeSeam extends AgentSeam {
  asks: string[];
  conversations: number;
  works: string[];
}

function fakeSeam(options: {
  agents?: DetectedAgent[];
  onWork?: () => void;
  plans?: string[];
}): FakeSeam {
  const plans = [...(options.plans ?? [])];
  const asks: string[] = [];
  const works: string[] = [];
  const seam: FakeSeam = {
    asks,
    conversations: 0,
    detect: () => Promise.resolve(options.agents ?? [AGENT]),
    open(): AgentConversation {
      seam.conversations += 1;
      return {
        ask: (prompt) => {
          asks.push(prompt);
          const plan = plans.shift();
          if (plan === undefined) {
            throw new Error("The fake agent ran out of plans");
          }
          return Promise.resolve(plan);
        },
        close: () => Promise.resolve(),
        work: (prompt) => {
          works.push(prompt);
          options.onWork?.();
          return Promise.resolve("done");
        },
      };
    },
    works,
  };
  return seam;
}

function docsFetch(urls: string[] = []): typeof fetch {
  return ((url: string) => {
    urls.push(String(url));
    return Promise.resolve(new Response(index));
  }) as unknown as typeof fetch;
}

describe("runWizard", () => {
  it(
    "plans, implements and reports the changes",
    async () => {
      const cwd = repository();
      const urls: string[] = [];
      const seam = fakeSeam({
        onWork: () => {
          mkdirSync(dirname(join(cwd, "lib/specify.ts")), { recursive: true });
          writeFileSync(join(cwd, "lib/specify.ts"), "// client\n");
        },
        plans: [PLAN],
      });
      const script = terminal();

      const exitCode = runWizard({
        cwd,
        fetchImpl: docsFetch(urls),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, `spk_live_pasted_key${ENTER}`);
      await script.type(PLACEMENT_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(urls).toEqual(["https://docs.specify.sh/llms.txt"]);
      expect(seam.conversations).toBe(1);
      expect(seam.asks).toHaveLength(1);
      expect(seam.asks[0]).toContain("This turn reports");
      expect(seam.asks[0]).toContain("[Next.js](/publishing/nextjs)");
      expect(seam.works).toHaveLength(1);
      expect(seam.works[0]).toContain("spk_live_pasted_key");
      expect(seam.works[0]).toContain("<specify-docs-index>");
      expect(seam.works[0]).toContain("## What I found");
      expect(seam.works[0]).toContain("Do not commit");
      expect(seam.works[0]).toContain(`Build these and no others:\n- ${HERO}`);
      expect(script.text()).toContain("Using Codex 1.2.3");
      expect(script.text()).toContain("Nothing has been changed yet.");
      expect(script.text()).toContain("lib/specify.ts");
      expect(script.text()).toContain("New files, not yet tracked by Git");
    },
    TEST_TIMEOUT
  );

  it(
    "builds the placements the developer kept and names the ones they dropped",
    async () => {
      const seam = fakeSeam({ plans: [PLAN] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(PLACEMENT_PROMPT, `${DOWN}${SPACE}${ENTER}`);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.works).toHaveLength(1);
      expect(seam.works[0]).toContain(`Build these and no others:\n- ${HERO}`);
      expect(seam.works[0]).toContain(`Do not add them:\n- ${SIDEBAR}`);
      expect(script.text()).toContain("Which of these placements");
    },
    TEST_TIMEOUT
  );

  it(
    "still implements when the developer keeps no placement at all",
    async () => {
      const seam = fakeSeam({ plans: [PLAN] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(PLACEMENT_PROMPT, `${SPACE}${DOWN}${SPACE}${ENTER}`);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.works).toHaveLength(1);
      expect(seam.works[0]).toContain(
        "wants none of the placements you proposed"
      );
      expect(seam.works[0]).toContain(`Do not add them:\n- ${HERO}`);
      expect(seam.works[0]).toContain(SIDEBAR);
    },
    TEST_TIMEOUT
  );

  it(
    "skips the picker when the plan proposes no placements",
    async () => {
      const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(script.text()).not.toContain("Which of these placements");
      expect(seam.works).toHaveLength(1);
      expect(seam.works[0]).toContain("built with esbuild");
      expect(seam.works[0]).not.toContain("Build these and no others");
      expect(seam.works[0]).not.toContain("Do not add them");
    },
    TEST_TIMEOUT
  );

  it(
    "asks once more when the agent replies with nothing",
    async () => {
      const seam = fakeSeam({ plans: ["  \n", PLAN_WITHOUT_PLACEMENTS] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.conversations).toBe(1);
      expect(seam.asks).toHaveLength(2);
      expect(seam.asks[0]).toBe(seam.asks[1]);
      expect(seam.works).toHaveLength(1);
    },
    TEST_TIMEOUT
  );

  it(
    "stops without changing anything when both replies are empty",
    async () => {
      const seam = fakeSeam({ plans: ["", ""] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(1);
      expect(seam.asks).toHaveLength(2);
      expect(seam.works).toEqual([]);
      expect(script.text()).toContain("replied with nothing, twice");
      expect(script.text()).toContain(
        "https://docs.specify.sh/publishing/get-started"
      );
    },
    TEST_TIMEOUT
  );

  it(
    "sends feedback back to the same conversation",
    async () => {
      const revised = PLAN_WITHOUT_PLACEMENTS.replace(
        "src/specify.js",
        "src/ads.js"
      );
      const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS, revised] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, `${DOWN}${ENTER}`);
      await script.type(
        FEEDBACK_PROMPT,
        `Put the client in src/ads.js${ENTER}`
      );
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.conversations).toBe(1);
      expect(seam.asks).toHaveLength(2);
      expect(seam.asks[1]).toContain("Put the client in src/ads.js");
      expect(seam.works[0]).toContain("src/ads.js");
      expect(script.text()).toContain("src/ads.js");
    },
    TEST_TIMEOUT
  );

  it(
    "changes nothing when the plan is aborted",
    async () => {
      const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, `${DOWN}${DOWN}${ENTER}`);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.works).toEqual([]);
      expect(script.text()).toContain("Aborted");
    },
    TEST_TIMEOUT
  );

  it(
    "uses the placeholder key when the key is skipped",
    async () => {
      const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.works[0]).toContain("spk_your_key_here");
      expect(seam.works[0]).toContain(
        "https://app.specify.sh/publish/publisher-keys"
      );
    },
    TEST_TIMEOUT
  );

  it(
    "stops when the developer declines a dirty working tree",
    async () => {
      const seam = fakeSeam({ plans: [PLAN] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(true),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type("Continue anyway?", "n");

      await expect(exitCode).resolves.toBe(0);
      expect(seam.conversations).toBe(0);
      expect(seam.works).toEqual([]);
      expect(script.text()).toContain("changes will mix with yours");
    },
    TEST_TIMEOUT
  );

  it(
    "warns that a directory outside Git leaves no diff to review",
    async () => {
      const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: plainDirectory(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type("Continue anyway?", "y");
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.works).toHaveLength(1);
      expect(script.text()).toContain("not a Git repository");
      expect(script.text()).toContain("no diff to show");
    },
    TEST_TIMEOUT
  );

  it(
    "asks the developer which agent to use when several are installed",
    async () => {
      const seam = fakeSeam({
        agents: [AGENT, { id: "claude", name: "Claude Code" }],
        plans: [PLAN_WITHOUT_PLACEMENTS],
      });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type("Which coding agent", `${DOWN}${ENTER}`);
      await script.type(KEY_PROMPT, ENTER);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(script.text()).toContain("Claude Code");
    },
    TEST_TIMEOUT
  );

  it(
    "points to the manual guide when no agent is installed",
    async () => {
      const seam = fakeSeam({ agents: [] });
      const script = terminal();

      await expect(
        runWizard({
          cwd: repository(),
          fetchImpl: docsFetch(),
          input: script.input,
          output: script.output,
          seam,
        })
      ).resolves.toBe(1);
      expect(script.text()).toContain("No supported coding agent was found");
      expect(script.text()).toContain(
        "https://docs.specify.sh/publishing/get-started"
      );
    },
    TEST_TIMEOUT
  );

  it(
    "stops before the first turn when the documentation cannot be fetched",
    async () => {
      const seam = fakeSeam({ plans: [PLAN] });
      const script = terminal();

      const exitCode = runWizard({
        cwd: repository(),
        fetchImpl: (() =>
          Promise.resolve(
            new Response("nope", { status: 503 })
          )) as unknown as typeof fetch,
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(1);
      expect(seam.conversations).toBe(0);
      expect(seam.asks).toEqual([]);
      expect(script.text()).toContain("https://docs.specify.sh/llms.txt");
    },
    TEST_TIMEOUT
  );
});
