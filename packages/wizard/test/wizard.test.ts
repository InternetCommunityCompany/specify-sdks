import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AgentConversation, AgentSeam, DetectedAgent } from "../src/agent";
import type { IntegrationPlan } from "../src/plan";
import { runWizard } from "../src/wizard";

const AGENT: DetectedAgent = {
  id: "codex",
  name: "Codex",
  supportsReadOnly: true,
  version: "1.2.3",
};
const KEY_PROMPT = "Paste your publisher key";
const REVIEW_PROMPT = "Go ahead with this plan?";
const FEEDBACK_PROMPT = "What should the agent do differently?";
const ENTER = "\r";
const DOWN = "\u001B[B";
const TEST_TIMEOUT = 20_000;

const directories: string[] = [];
let docs: { full: string; index: string };

beforeAll(async () => {
  const [index, full] = await Promise.all([
    readFile(resolve("packages/wizard/test/fixtures/llms.txt"), "utf8"),
    readFile(resolve("packages/wizard/test/fixtures/llms-full.txt"), "utf8"),
  ]);
  docs = { full, index };
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
        const index = captured.indexOf(marker, cursor);
        if (index === -1) {
          return;
        }
        cursor = index + marker.length;
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
  plans?: IntegrationPlan[];
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
          if (!plan) {
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

function planFixture(
  overrides: Partial<IntegrationPlan> = {}
): IntegrationPlan {
  return {
    changes: [
      {
        action: "create",
        path: "lib/specify.ts",
        summary: "Creates the shared Specify client",
      },
      {
        action: "modify",
        path: "app/page.tsx",
        summary: "Renders the hero ad slot",
      },
    ],
    clientModule: {
      path: "lib/specify.ts",
      reason: "Every page imports from lib",
    },
    consent: {
      decisionSite: "app/layout.tsx",
      platform: "Cookiebot",
      present: true,
    },
    envFile: {
      path: ".env.local",
      variable: "NEXT_PUBLIC_SPECIFY_PUBLISHER_KEY",
    },
    framework: "nextjs",
    frameworkNotes: "App Router",
    packageManager: "pnpm",
    placements: [
      {
        adUnitId: "home-hero",
        file: "app/page.tsx",
        imageFormat: "LANDSCAPE",
        reason: "Above the fold",
      },
    ],
    typescript: true,
    wallets: {
      connected: true,
      connectionSite: "components/connect.tsx",
      library: "wagmi",
    },
    ...overrides,
  };
}

function docsFetch(): typeof fetch {
  return ((url: string) =>
    Promise.resolve(
      new Response(url.endsWith("llms-full.txt") ? docs.full : docs.index)
    )) as unknown as typeof fetch;
}

describe("runWizard", () => {
  it(
    "plans, implements and reports the changes",
    async () => {
      const cwd = repository();
      const seam = fakeSeam({
        onWork: () => {
          mkdirSync(dirname(join(cwd, "lib/specify.ts")), { recursive: true });
          writeFileSync(join(cwd, "lib/specify.ts"), "// client\n");
        },
        plans: [planFixture()],
      });
      const script = terminal();

      const exitCode = runWizard({
        cwd,
        fetchImpl: docsFetch(),
        input: script.input,
        output: script.output,
        seam,
      });
      await script.type(KEY_PROMPT, `spk_live_pasted_key${ENTER}`);
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.conversations).toBe(1);
      expect(seam.asks).toHaveLength(1);
      expect(seam.asks[0]).toContain("reads and reports only");
      expect(seam.works).toHaveLength(1);
      expect(seam.works[0]).toContain("spk_live_pasted_key");
      expect(seam.works[0]).toContain("<specify-api-reference>");
      expect(seam.works[0]).toContain("/publishing/nextjs");
      expect(seam.works[0]).toContain("Do not commit");
      expect(seam.works[0]).toContain('"adUnitId": "home-hero"');
      expect(script.text()).toContain("Using Codex 1.2.3");
      expect(script.text()).toContain("Nothing has been changed yet.");
      expect(script.text()).toContain("lib/specify.ts");
      expect(script.text()).toContain("New files, not yet tracked by Git");
    },
    TEST_TIMEOUT
  );

  it(
    "sends feedback back to the same conversation",
    async () => {
      const seam = fakeSeam({
        plans: [
          planFixture(),
          planFixture({
            clientModule: { path: "src/ads.ts", reason: "Asked" },
          }),
        ],
      });
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
        `Put the client in src/ads.ts${ENTER}`
      );
      await script.type(REVIEW_PROMPT, ENTER);

      await expect(exitCode).resolves.toBe(0);
      expect(seam.conversations).toBe(1);
      expect(seam.asks).toHaveLength(2);
      expect(seam.asks[1]).toContain("Put the client in src/ads.ts");
      expect(seam.works[0]).toContain('"path": "src/ads.ts"');
      expect(script.text()).toContain("src/ads.ts");
    },
    TEST_TIMEOUT
  );

  it(
    "changes nothing when the plan is aborted",
    async () => {
      const seam = fakeSeam({ plans: [planFixture()] });
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
      const seam = fakeSeam({ plans: [planFixture()] });
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
      const seam = fakeSeam({ plans: [planFixture()] });
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
      const seam = fakeSeam({ plans: [planFixture()] });
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
        agents: [
          AGENT,
          { id: "claude", name: "Claude Code", supportsReadOnly: false },
        ],
        plans: [planFixture()],
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
      const seam = fakeSeam({ plans: [planFixture()] });
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
