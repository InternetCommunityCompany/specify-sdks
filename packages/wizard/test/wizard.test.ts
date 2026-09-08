import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  AgentConversation,
  AgentReply,
  AgentSeam,
  DetectedAgent,
} from "../src/agent";
import type { Ui } from "../src/ui/host";
import { type Choice, WizardCancelled } from "../src/ui/store";
import { runWizard } from "../src/wizard";

const AGENT: DetectedAgent = { id: "codex", name: "Codex", version: "1.2.3" };
const HERO = "app/page.tsx - the hero, above the fold";
const SIDEBAR = "app/blog/page.tsx - between the list and the footer";
const DETAILS = "## What I found\n\nA Next.js app with the App Router.";
const PLAN = {
  details: DETAILS,
  placements: [
    { file: "app/page.tsx", reason: "the hero, above the fold" },
    { file: "app/blog/page.tsx", reason: "between the list and the footer" },
  ],
  summary: "A Next.js app that needs the client and one slot.",
};
const PLAN_WITHOUT_PLACEMENTS = {
  details: "## What I found\n\nA plain site built with esbuild.",
  placements: [],
  summary: "A plain esbuild site.",
};

const directories: string[] = [];
let docsIndex: string;

beforeAll(async () => {
  docsIndex = await readFile(
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

interface Answers {
  confirm?: boolean[];
  /** Labels to keep; anything else offered is dropped. */
  multiselect?: string[][];
  review?: string[];
  select?: string[];
  text?: string[];
}

interface FakeUi extends Ui {
  asked: string[];
  /** Each step as `title: detail` once it settles. */
  finished: string[];
  offered: string[][];
  record: string[];
  shown: string[];
  titles: string[];
}

function next<T>(queue: T[] | undefined, what: string): T {
  const value = queue?.shift();
  if (value === undefined) {
    throw new Error(`The script ran out of ${what} answers`);
  }
  return value;
}

function fakeUi(answers: Answers = {}): FakeUi {
  const asked: string[] = [];
  const finished: string[] = [];
  const offered: string[][] = [];
  const record: string[] = [];
  const shown: string[] = [];
  const titles: string[] = [];
  const labels = (choices: Choice[]) => choices.map((choice) => choice.label);
  const named = (at: number) => titles[at] ?? `step ${at}`;

  return {
    activity: (line) => shown.push(line),
    asked,
    begin: (at) => shown.push(`begin ${named(at)}`),
    clear: () => shown.push("clear"),
    close: () => Promise.resolve(),
    confirm(message) {
      asked.push(message);
      return Promise.resolve(next(answers.confirm, "confirm"));
    },
    error: (lines) => shown.push(lines.join("\n")),
    fail(at, detail) {
      finished.push(`${named(at)} failed: ${detail ?? ""}`);
    },
    finish(at, detail) {
      finished.push(detail ? `${named(at)}: ${detail}` : named(at));
    },
    finished,
    keep: (text) => record.push(text),
    multiselect(message, choices) {
      asked.push(message);
      offered.push(labels(choices));
      return Promise.resolve(next(answers.multiselect, "multiselect"));
    },
    note: (title, lines) => shown.push(`${title}: ${lines.join(" | ")}`),
    offered,
    plan(steps, where) {
      titles.splice(0, titles.length, ...steps);
      shown.push(`where ${where}`);
    },
    record,
    review(plan, message, choices) {
      asked.push(message);
      shown.push(plan.details);
      offered.push(labels(choices));
      return Promise.resolve(next(answers.review, "review"));
    },
    select(message, choices) {
      asked.push(message);
      offered.push(labels(choices));
      return Promise.resolve(next(answers.select, "select"));
    },
    shown,
    startTask: (title) => shown.push(title),
    stopTask: () => shown.push("stop"),
    text(message) {
      asked.push(message);
      return Promise.resolve(next(answers.text, "text"));
    },
    titles,
    warn: (lines) => shown.push(lines.join("\n")),
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
  plans?: (unknown | undefined)[];
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
        ask: (prompt): Promise<AgentReply> => {
          asks.push(prompt);
          if (plans.length === 0) {
            throw new Error("The fake agent ran out of plans");
          }
          return Promise.resolve({ json: plans.shift(), text: "" });
        },
        close: () => Promise.resolve(),
        work: (prompt): Promise<AgentReply> => {
          works.push(prompt);
          options.onWork?.();
          return Promise.resolve({ text: "done" });
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
    // No publishing bundle in these runs, so the index path is exercised.
    return Promise.resolve(
      String(url).endsWith("llms-full.txt")
        ? new Response("not here", { status: 404 })
        : new Response(docsIndex)
    );
  }) as unknown as typeof fetch;
}

describe("runWizard", () => {
  it("plans, implements and reports the changes", async () => {
    const cwd = repository();
    const urls: string[] = [];
    const seam = fakeSeam({
      onWork: () => {
        mkdirSync(dirname(join(cwd, "lib/specify.ts")), { recursive: true });
        writeFileSync(join(cwd, "lib/specify.ts"), "// client\n");
        writeFileSync(join(cwd, ".env.local"), "KEY=spk_your_key_here\n");
      },
      plans: [PLAN],
    });
    const ui = fakeUi({ multiselect: [[HERO, SIDEBAR]], review: ["approve"] });

    await expect(
      runWizard({ cwd, fetchImpl: docsFetch(urls), seam, ui })
    ).resolves.toBe(0);

    expect(urls).toContain("https://docs.specify.sh/llms.txt");
    expect(urls).toContain("https://docs.specify.sh/publishing/llms-full.txt");
    expect(seam.conversations).toBe(1);
    expect(seam.asks).toHaveLength(1);
    expect(seam.asks[0]).toContain("This turn reports");
    expect(seam.asks[0]).toContain("[Next.js](/publishing/nextjs)");
    expect(seam.works).toHaveLength(1);
    expect(seam.works[0]).toContain("<specify-docs-index>");
    expect(seam.works[0]).toContain(DETAILS);
    expect(seam.works[0]).toContain("Do not commit");
    expect(seam.works[0]).toContain(`Build these and no others:\n- ${HERO}`);
    expect(ui.finished).toContain("Choose a coding agent: Codex 1.2.3");
    expect(ui.finished).toContain(`Read the project: ${PLAN.summary}`);
    expect(ui.record.join("\n")).toContain("lib/specify.ts");
    expect(ui.record.join("\n")).toContain("New files, not yet tracked by Git");
  });

  it("walks the developer through numbered steps", async () => {
    const ui = fakeUi({ multiselect: [[HERO]], review: ["approve"] });

    await runWizard({
      cwd: repository(),
      fetchImpl: docsFetch(),
      seam: fakeSeam({ plans: [PLAN] }),
      ui,
    });

    expect(ui.titles).toEqual([
      "Choose a coding agent",
      "Check the working tree",
      "Read the project",
      "Review the plan",
      "Write the changes",
    ]);
    for (const title of ui.titles) {
      expect(ui.shown).toContain(`begin ${title}`);
    }
    expect(ui.finished).toContain("Check the working tree: clean");
    expect(ui.finished).toContain("Review the plan: 1 placement");
  });

  it("says what will happen before the agent is let loose", async () => {
    const ui = fakeUi({ multiselect: [[HERO]], review: ["approve"] });
    const cwd = repository();

    await runWizard({
      cwd,
      fetchImpl: docsFetch(),
      seam: fakeSeam({ plans: [PLAN] }),
      ui,
    });

    const contract = ui.shown.find((line) => line.startsWith("How this works"));
    expect(contract).toBeDefined();
    expect(contract).toContain("Nothing is written until you approve");
    expect(contract).toContain("stay uncommitted in your working tree");
    expect(contract).toContain("never to Specify");
    expect(contract).toContain("Codex reads this project");
    expect(contract).not.toContain("1.2.3");
    expect(ui.shown).toContain(`where ${cwd}`);
  });

  it("summarizes each turn by what the agent actually did", async () => {
    const seam: AgentSeam = {
      detect: () => Promise.resolve([AGENT]),
      open: () => ({
        ask: (_prompt, opts) => {
          opts?.onActivity?.({
            input: { path: "package.json" },
            kind: "tool",
            name: "read",
          });
          opts?.onActivity?.({
            input: { command: "bun pm ls" },
            kind: "tool",
            name: "bash",
          });
          return Promise.resolve({ json: PLAN_WITHOUT_PLACEMENTS, text: "" });
        },
        close: () => Promise.resolve(),
        work: (_prompt, opts) => {
          opts?.onActivity?.({
            change: "create",
            kind: "file",
            path: "lib/specify.ts",
          });
          return Promise.resolve({ text: "done" });
        },
      }),
    };
    const ui = fakeUi({ review: ["approve"] });

    await runWizard({
      cwd: repository(),
      fetchImpl: docsFetch(),
      seam,
      ui,
    });

    expect(ui.shown).toContain("Read package.json");
    expect(ui.shown).toContain("Ran bun pm ls");
    expect(ui.shown).toContain("Created lib/specify.ts");
    expect(ui.finished).toContain("Write the changes");
  });

  it("builds the placements the developer kept and names the ones they dropped", async () => {
    const seam = fakeSeam({ plans: [PLAN] });
    const ui = fakeUi({ multiselect: [[HERO]], review: ["approve"] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(ui.offered).toContainEqual([HERO, SIDEBAR]);
    expect(seam.works[0]).toContain(`Build these and no others:\n- ${HERO}`);
    expect(seam.works[0]).toContain(`Do not add them:\n- ${SIDEBAR}`);
  });

  it("still implements when the developer keeps no placement at all", async () => {
    const seam = fakeSeam({ plans: [PLAN] });
    const ui = fakeUi({ multiselect: [[]], review: ["approve"] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.works[0]).toContain(
      "wants none of the placements you proposed"
    );
    expect(seam.works[0]).toContain(`Do not add them:\n- ${HERO}`);
    expect(seam.works[0]).toContain(SIDEBAR);
  });

  it("skips the picker when the plan proposes no placements", async () => {
    const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
    const ui = fakeUi({ review: ["approve"] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(ui.asked).not.toContain(
      "Which of these placements should the agent build?"
    );
    expect(seam.works[0]).not.toContain("Build these and no others");
  });

  it("asks once more when the agent does not answer with a plan", async () => {
    const seam = fakeSeam({ plans: [undefined, PLAN_WITHOUT_PLACEMENTS] });
    const ui = fakeUi({ review: ["approve"] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.conversations).toBe(1);
    expect(seam.asks).toHaveLength(2);
    expect(seam.asks[0]).toBe(seam.asks[1]);
    expect(seam.works).toHaveLength(1);
  });

  it("stops without changing anything when neither reply is a plan", async () => {
    const seam = fakeSeam({ plans: [undefined, { details: "" }] });
    const ui = fakeUi();

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(1);

    expect(seam.asks).toHaveLength(2);
    expect(seam.works).toEqual([]);
    expect(ui.shown.join("\n")).toContain("did not report a plan, twice");
    expect(ui.finished.join("\n")).toContain("Read the project failed");
    expect(ui.record.join("\n")).toContain(
      "https://docs.specify.sh/publishing/get-started"
    );
  });

  it("sends feedback back to the same conversation", async () => {
    const revised = {
      ...PLAN_WITHOUT_PLACEMENTS,
      details: "## What I found\n\nThe client belongs in src/ads.js.",
    };
    const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS, revised] });
    const ui = fakeUi({
      review: ["feedback", "approve"],
      text: ["Put the client in src/ads.js"],
    });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.conversations).toBe(1);
    expect(seam.asks).toHaveLength(2);
    expect(seam.asks[1]).toContain("Put the client in src/ads.js");
    expect(seam.works[0]).toContain("src/ads.js");
  });

  it("re-asks without a turn when the developer sends empty feedback", async () => {
    const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
    const ui = fakeUi({ review: ["feedback", "approve"], text: ["   "] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.asks).toHaveLength(1);
    expect(seam.works).toHaveLength(1);
  });

  it("changes nothing when the plan is aborted", async () => {
    const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
    const ui = fakeUi({ review: ["abort"] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.works).toEqual([]);
    expect(ui.record.join("\n")).toContain("Aborted");
  });

  it("never asks for a publisher key, and says how to add one", async () => {
    const cwd = repository();
    const seam = fakeSeam({
      onWork: () =>
        writeFileSync(
          join(cwd, ".env.local"),
          "# replace this\nKEY=spk_your_key_here\n"
        ),
      plans: [PLAN_WITHOUT_PLACEMENTS],
    });
    const ui = fakeUi({ review: ["approve"] });

    await expect(
      runWizard({ cwd, fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(ui.asked.join("\n")).not.toContain("publisher key");
    expect(seam.works[0]).toContain("must not ask for one");
    const record = ui.record.join("\n");
    expect(record).toContain("Add your publisher key");
    expect(record).toContain("Replace spk_your_key_here in .env.local");
    expect(record).toContain("https://app.specify.sh/publish/publisher-keys");
  });

  it("still says how to add a key when no env file names the placeholder", async () => {
    const ui = fakeUi({ review: ["approve"] });

    await runWizard({
      cwd: repository(),
      fetchImpl: docsFetch(),
      seam: fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] }),
      ui,
    });

    expect(ui.record.join("\n")).toContain(
      "Replace spk_your_key_here in the env file the agent wrote"
    );
  });

  it("stops when the developer declines a dirty working tree", async () => {
    const seam = fakeSeam({ plans: [PLAN] });
    const ui = fakeUi({ confirm: [false] });

    await expect(
      runWizard({ cwd: repository(true), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.conversations).toBe(0);
    expect(seam.works).toEqual([]);
    expect(ui.shown.join("\n")).toContain("changes will mix with yours");
  });

  it("warns that a directory outside Git leaves no diff to review", async () => {
    const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
    const ui = fakeUi({ confirm: [true], review: ["approve"] });

    await expect(
      runWizard({ cwd: plainDirectory(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.works).toHaveLength(1);
    expect(ui.shown.join("\n")).toContain("not a Git repository");
    expect(ui.record.join("\n")).toContain("no diff to show");
  });

  it("asks which agent to use when several are installed", async () => {
    const seam = fakeSeam({
      agents: [AGENT, { id: "claude", name: "Claude Code" }],
      plans: [PLAN_WITHOUT_PLACEMENTS],
    });
    const ui = fakeUi({ review: ["approve"], select: ["claude"] });

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(ui.offered).toContainEqual(["Codex 1.2.3", "Claude Code"]);
    expect(ui.finished).toContain("Choose a coding agent: Claude Code");
  });

  it("points to the manual guide when no agent is installed", async () => {
    const ui = fakeUi();

    await expect(
      runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        seam: fakeSeam({ agents: [] }),
        ui,
      })
    ).resolves.toBe(1);

    expect(ui.shown.join("\n")).toContain(
      "No supported coding agent was found"
    );
    expect(ui.shown.join("\n")).toContain(
      "https://docs.specify.sh/publishing/get-started"
    );
  });

  it("stops before the first turn when the documentation cannot be fetched", async () => {
    const seam = fakeSeam({ plans: [PLAN] });
    const ui = fakeUi();

    await expect(
      runWizard({
        cwd: repository(),
        fetchImpl: (() =>
          Promise.resolve(
            new Response("nope", { status: 503 })
          )) as unknown as typeof fetch,
        seam,
        ui,
      })
    ).resolves.toBe(1);

    expect(seam.conversations).toBe(0);
    expect(seam.asks).toEqual([]);
    expect(ui.record.join("\n")).toContain("https://docs.specify.sh/llms.txt");
  });

  it("stops cleanly when the developer presses Ctrl-C at a prompt", async () => {
    const seam = fakeSeam({ plans: [PLAN_WITHOUT_PLACEMENTS] });
    const ui = fakeUi();
    ui.review = () =>
      Promise.reject(new WizardCancelled("Stopped. Nothing was changed."));

    await expect(
      runWizard({ cwd: repository(), fetchImpl: docsFetch(), seam, ui })
    ).resolves.toBe(0);

    expect(seam.works).toEqual([]);
    expect(ui.record.join("\n")).toContain("Stopped. Nothing was changed.");
  });

  it("does not carry on when a turn finishes after the developer stopped", async () => {
    const stopping = new AbortController();
    const seam: AgentSeam = {
      detect: () => Promise.resolve([AGENT]),
      open: () => ({
        // An agent that ignores the signal and answers anyway.
        ask: () => {
          stopping.abort();
          return Promise.resolve({ json: PLAN, text: "" });
        },
        close: () => Promise.resolve(),
        work: () => Promise.resolve({ text: "done" }),
      }),
    };
    const ui = fakeUi();

    await expect(
      runWizard({
        cwd: repository(),
        fetchImpl: docsFetch(),
        seam,
        signal: stopping.signal,
        ui,
      })
    ).resolves.toBe(0);

    expect(ui.asked).not.toContain("Go ahead with this plan?");
    expect(ui.record.join("\n")).toContain("check git status");
  });

  it("names the cause of a failure only when asked to be verbose", async () => {
    const failing: AgentSeam = {
      detect: () => Promise.resolve([AGENT]),
      open: () => ({
        ask: () => {
          throw new Error("The coding agent could not complete the request.", {
            cause: new Error("codex exited with status 127"),
          });
        },
        close: () => Promise.resolve(),
        work: () => Promise.resolve({ text: "" }),
      }),
    };
    const quiet = fakeUi();
    const loud = fakeUi();

    await runWizard({
      cwd: repository(),
      fetchImpl: docsFetch(),
      seam: failing,
      ui: quiet,
    });
    await runWizard({
      cwd: repository(),
      fetchImpl: docsFetch(),
      seam: failing,
      ui: loud,
      verbose: true,
    });

    expect(quiet.record.join("\n")).not.toContain("status 127");
    expect(loud.record.join("\n")).toContain(
      "caused by: Error: codex exited with status 127"
    );
  });
});
