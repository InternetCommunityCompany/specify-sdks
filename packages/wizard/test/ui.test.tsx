import { render } from "ink-testing-library";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SdkMode } from "../src/sdk";
import { App } from "../src/ui/app";
import {
  type Ask,
  type Reply,
  WizardCancelled,
  WizardStore,
} from "../src/ui/store";

// React only treats act() as a test boundary with this flag set. Testing
// Library sets it, ink-testing-library doesn't.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PUBLISHER_PLAN = {
  details:
    "## What I found\n\nA **Next.js** app with `bun.lock`.\n\n- No consent banner",
  suggestions: ["app/page.tsx - the hero"],
  summary: "A Next.js app.",
};

type View = ReturnType<typeof render>;

const TERMINAL = { columns: 100, rows: 24 };
const CHECKED = "▣";

const mounted: View[] = [];
const realSize = {
  columns: process.stdout.columns,
  rows: process.stdout.rows,
};

/**
 * The app sizes itself from process.stdout, so the size is set before every
 * mount. ink-testing-library draws 100 columns wide, whatever is set here.
 */
function mount(
  mode: SdkMode,
  size: { columns: number; rows: number },
  onCancel?: () => void
) {
  process.stdout.columns = size.columns;
  process.stdout.rows = size.rows;
  const store = new WizardStore(onCancel);
  const view = render(<App mode={mode} store={store} />);
  mounted.push(view);
  return { store, view };
}

function screen(view: View, text: string): Promise<string> {
  return vi.waitFor(() => {
    const frame = view.lastFrame() ?? "";
    expect(frame).toContain(text);
    return frame;
  });
}

function count(frame: string, text: string): number {
  return frame.split(text).length - 1;
}

/**
 * Ink attaches a prompt's key handler in an effect that runs after the prompt
 * is drawn, so a key sent as soon as it shows can be lost. act() runs effects
 * before it resolves.
 */
function ask<Value extends Reply>(
  store: WizardStore,
  prompt: Ask
): Promise<{ answer: Promise<Value> }> {
  return act(() => ({ answer: store.request<Value>(prompt) }));
}

/** Sends one chunk, the way a terminal delivers a paste or an escape key. */
async function press(view: View, chunk: string): Promise<void> {
  await act(() => view.stdin.write(chunk));
}

/** Flush each key's React updates before sending the next key. */
function type(
  view: { stdin: { write: (data: string) => void } },
  keys: string
): Promise<void> {
  return [...keys].reduce(
    (typed, key) => typed.then(() => act(() => view.stdin.write(key))),
    Promise.resolve()
  );
}

describe("App", () => {
  afterEach(() => {
    for (const view of mounted.splice(0)) {
      view.unmount();
    }
    process.stdout.columns = realSize.columns;
    process.stdout.rows = realSize.rows;
  });

  it("labels advertiser setup and lets the developer toggle events", async () => {
    const { store, view } = mount("advertiser", TERMINAL);
    const { answer: kept } = await ask<string[]>(store, {
      initial: ["purchase", "user_signed_up"],
      kind: "multiselect",
      message: "Which of these events should the agent capture?",
      options: [
        { label: "purchase", value: "purchase" },
        { label: "user_signed_up", value: "user_signed_up" },
      ],
    });

    const frame = await screen(view, "Space toggles an event, Enter confirms.");
    expect(frame).toContain("Specify advertiser SDK");
    expect(frame).not.toContain("placement");
    expect(count(frame, CHECKED)).toBe(2);
    await type(view, " ");
    await vi.waitFor(() =>
      expect(count(view.lastFrame() ?? "", CHECKED)).toBe(1)
    );
    await type(view, "\r");
    await expect(kept).resolves.toEqual(["user_signed_up"]);
  });

  it("shows every step from the start, and what each one came to", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    store.plan(
      ["Choose a coding agent", "Check the working tree", "Read the project"],
      "~/project"
    );
    store.finishStep(0, "Claude Code 2.1.246");
    store.beginStep(1);

    const frame = await screen(view, "Claude Code 2.1.246");
    expect(frame).toContain("~/project");
    // Steps still to come are on screen before they run.
    expect(frame).toContain("Read the project");
    expect(frame).toContain("Check the working tree");
  });

  it("shows the running task and what the agent is doing", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    store.plan(["Read the project"], "~/project");
    store.beginStep(0);
    store.startTask("Reading the project");
    store.addLine("Read package.json");

    const frame = await screen(view, "Read package.json");
    expect(frame).toContain("Reading the project");
  });

  it("keeps only the tail of a long activity list on screen", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    store.startTask("Reading the project");
    for (let step = 0; step < 12; step += 1) {
      store.addLine(`Read file-${step}.ts`);
    }

    const frame = await screen(view, "Read file-11.ts");
    expect(frame).not.toContain("Read file-0.ts");
  });

  it("renders the plan as markdown, not as its source", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    store.request({
      kind: "review",
      message: "Go ahead with this plan?",
      options: [{ label: "Approve, make these changes", value: "approve" }],
      plan: PUBLISHER_PLAN,
    });

    const frame = await screen(view, "Integration plan");
    expect(frame).toContain("What I found");
    expect(frame).not.toContain("## What I found");
    expect(frame).toContain(
      "Scroll the plan: mouse wheel, PgUp/PgDn, or Ctrl-U/Ctrl-D."
    );
  });

  it("scrolls the plan on the wheel without moving the decision", async () => {
    // 24 rows leave the plan 13; all 40 lines would fit a tall terminal.
    const { store, view } = mount("publisher", { columns: 100, rows: 24 });
    const lines = Array.from({ length: 40 }, (_, at) => `- Plan line ${at}`);
    const { answer: decision } = await ask<string>(store, {
      kind: "review",
      message: "Go ahead with this plan?",
      options: [
        { label: "Approve, make these changes", value: "approve" },
        { label: "Abort, change nothing", value: "abort" },
      ],
      plan: { ...PUBLISHER_PLAN, details: lines.join("\n") },
    });
    await screen(view, "Plan line 0");

    // A terminal reports each wheel notch as one whole chunk.
    for (let notch = 0; notch < 3; notch += 1) {
      view.stdin.write("\u001B[<65;9;9M");
    }

    await vi.waitFor(() =>
      expect(view.lastFrame() ?? "").not.toContain("Plan line 0")
    );
    expect(view.lastFrame() ?? "").toContain("Scroll the plan");
    // The selection was not cycled by the scrolling: Enter still approves.
    await type(view, "\r");
    await expect(decision).resolves.toBe("approve");
  });

  it("pages the plan on Ctrl-D and Ctrl-U", async () => {
    const { store, view } = mount("publisher", { columns: 100, rows: 24 });
    const lines = Array.from({ length: 40 }, (_, at) => `- Plan line ${at}`);
    await ask(store, {
      kind: "review",
      message: "Go ahead with this plan?",
      options: [{ label: "Approve, make these changes", value: "approve" }],
      plan: { ...PUBLISHER_PLAN, details: lines.join("\n") },
    });
    await screen(view, "Plan line 0");

    await type(view, "\u0004");
    await vi.waitFor(() =>
      expect(view.lastFrame() ?? "").not.toContain("Plan line 0")
    );

    await type(view, "\u0015");
    await screen(view, "Plan line 0");
  });

  it("clears the prompt once it is answered", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    const { answer: answered } = await ask<boolean>(store, {
      kind: "confirm",
      message: "Continue anyway?",
    });
    await screen(view, "Continue anyway?");
    await type(view, "y");

    await expect(answered).resolves.toBe(true);
    await vi.waitFor(() =>
      expect(view.lastFrame() ?? "").not.toContain("Continue anyway?")
    );
  });

  it("collects what the developer types as feedback", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    const { answer: typed } = await ask<string>(store, {
      kind: "text",
      message: "What should the agent do differently?",
    });
    await screen(view, "What should the agent do differently?");
    await type(view, "use src/ads.js\r");

    await expect(typed).resolves.toBe("use src/ads.js");
  });

  it("accepts pasted feedback and edits at the cursor", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    const { answer: typed } = await ask<string>(store, {
      kind: "text",
      message: "What should the agent do differently?",
    });
    await screen(view, "What should the agent do differently?");

    await press(view, "Use purchase in main.mjs");
    await screen(view, "Use purchase in main.mjs");
    await press(view, "\u001b[D");
    await press(view, "\u007f");
    await screen(view, "Use purchase in main.ms");
    await press(view, "t");
    await screen(view, "Use purchase in main.mts");
    await press(view, "\r");

    await expect(typed).resolves.toBe("Use purchase in main.mts");
  });

  it("submits the placements it was given as the initial choice", async () => {
    const { store, view } = mount("publisher", TERMINAL);
    const { answer: kept } = await ask<string[]>(store, {
      initial: ["app/page.tsx", "app/blog/page.tsx"],
      kind: "multiselect",
      message: "Which of these placements should the agent build?",
      options: [
        { label: "app/page.tsx", value: "app/page.tsx" },
        { label: "app/blog/page.tsx", value: "app/blog/page.tsx" },
      ],
    });
    await screen(view, "Space toggles a placement, Enter confirms.");
    await type(view, "\r");

    await expect(kept).resolves.toEqual(["app/page.tsx", "app/blog/page.tsx"]);
  });

  it("keeps the prompt on screen when the callouts outgrow the terminal", async () => {
    // 24 rows hold the newest few warnings; a tall terminal holds all 20.
    const { store, view } = mount("publisher", { columns: 100, rows: 24 });
    store.plan(["One", "Two", "Three", "Four", "Five"], "~/project");
    for (let index = 0; index < 20; index += 1) {
      store.add({ kind: "warn", lines: [`Warning number ${index}`] });
    }
    store.request<boolean>({ kind: "confirm", message: "Continue anyway?" });

    const frame = await screen(view, "Continue anyway?");
    expect(frame).toContain("Warning number 19");
    expect(frame).not.toContain("Warning number 0");
  });

  it("gives up the run on Ctrl-C, because raw mode never raises a signal", async () => {
    let aborted = false;
    const { store, view } = mount("publisher", TERMINAL, () => {
      aborted = true;
    });
    const { answer } = await ask<string>(store, {
      kind: "review",
      message: "Go ahead with this plan?",
      options: [{ label: "Approve, make these changes", value: "approve" }],
      plan: PUBLISHER_PLAN,
    });
    // The handler goes on before the key is sent: the rejection lands during
    // type(), and attaching after would leave it unhandled for a tick.
    const decision = answer.then(
      () => new Error("the prompt was answered, not cancelled"),
      (reason: unknown) => reason
    );
    await screen(view, "Go ahead with this plan?");
    await type(view, "\u0003");

    expect(await decision).toBeInstanceOf(WizardCancelled);
    expect(aborted).toBe(true);
  });
});
