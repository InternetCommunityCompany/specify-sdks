import { render } from "ink-testing-library";
import { act } from "react";
import { describe, expect, it } from "vitest";
import type { SdkMode } from "../src/sdk";
import { App } from "../src/ui/app";
import { WizardCancelled, WizardStore } from "../src/ui/store";

const PUBLISHER_PLAN = {
  details:
    "## What I found\n\nA **Next.js** app with `bun.lock`.\n\n- No consent banner",
  suggestions: ["app/page.tsx - the hero"],
  summary: "A Next.js app.",
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

function mount(mode: SdkMode, onCancel?: () => void) {
  const store = new WizardStore(onCancel);
  const view = render(<App mode={mode} store={store} />);
  return { store, view };
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
  it("labels advertiser setup and lets the developer toggle events", async () => {
    const { store, view } = mount("advertiser");
    const kept = store.request<string[]>({
      initial: ["purchase", "user_signed_up"],
      kind: "multiselect",
      message: "Which of these events should the agent capture?",
      options: [
        { label: "purchase", value: "purchase" },
        { label: "user_signed_up", value: "user_signed_up" },
      ],
    });
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).toContain("Specify advertiser SDK");
    expect(frame).toContain("Space toggles an event, Enter confirms.");
    expect(frame).not.toContain("placement");
    await type(view, " ");
    await settle();
    await type(view, "\r");
    await expect(kept).resolves.toEqual(["user_signed_up"]);
    view.unmount();
  });

  it("shows every step from the start, and what each one came to", async () => {
    const { store, view } = mount("publisher");
    store.plan(
      ["Choose a coding agent", "Check the working tree", "Read the project"],
      "~/project"
    );
    store.finishStep(0, "Claude Code 2.1.246");
    store.beginStep(1);
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).toContain("~/project");
    // Steps still to come are on screen before they run.
    expect(frame).toContain("Read the project");
    expect(frame).toContain("Claude Code 2.1.246");
    expect(frame).toContain("Check the working tree");
    view.unmount();
  });

  it("shows the running task and what the agent is doing", async () => {
    const { store, view } = mount("publisher");
    store.plan(["Read the project"], "~/project");
    store.beginStep(0);
    store.startTask("Reading the project");
    store.addLine("Read package.json");
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).toContain("Reading the project");
    expect(frame).toContain("Read package.json");
    view.unmount();
  });

  it("keeps only the tail of a long activity list on screen", async () => {
    const { store, view } = mount("publisher");
    store.startTask("Reading the project");
    for (let step = 0; step < 12; step += 1) {
      store.addLine(`Read file-${step}.ts`);
    }
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).toContain("Read file-11.ts");
    expect(frame).not.toContain("Read file-0.ts");
    view.unmount();
  });

  it("renders the plan as markdown, not as its source", async () => {
    const { store, view } = mount("publisher");
    store.request({
      kind: "review",
      message: "Go ahead with this plan?",
      options: [{ label: "Approve, make these changes", value: "approve" }],
      plan: PUBLISHER_PLAN,
    });
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).toContain("Integration plan");
    expect(frame).toContain("What I found");
    expect(frame).not.toContain("## What I found");
    expect(frame).toContain(
      "Scroll the plan: mouse wheel, PgUp/PgDn, or Ctrl-U/Ctrl-D."
    );
    view.unmount();
  });

  it("scrolls the plan on the wheel without moving the decision", async () => {
    const { store, view } = mount("publisher");
    const lines = Array.from({ length: 40 }, (_, at) => `- Plan line ${at}`);
    const decision = store.request<string>({
      kind: "review",
      message: "Go ahead with this plan?",
      options: [
        { label: "Approve, make these changes", value: "approve" },
        { label: "Abort, change nothing", value: "abort" },
      ],
      plan: { ...PUBLISHER_PLAN, details: lines.join("\n") },
    });
    await settle();
    expect(view.lastFrame() ?? "").toContain("Plan line 0");

    // A terminal reports each wheel notch as one whole chunk.
    for (let notch = 0; notch < 3; notch += 1) {
      view.stdin.write("\u001B[<65;9;9M");
    }
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).not.toContain("Plan line 0");
    expect(frame).toContain("Scroll the plan");

    // The selection was not cycled by the scrolling: Enter still approves.
    await type(view, "\r");
    await expect(decision).resolves.toBe("approve");
    view.unmount();
  });

  it("pages the plan on Ctrl-D and Ctrl-U", async () => {
    const { store, view } = mount("publisher");
    const lines = Array.from({ length: 40 }, (_, at) => `- Plan line ${at}`);
    store.request<string>({
      kind: "review",
      message: "Go ahead with this plan?",
      options: [{ label: "Approve, make these changes", value: "approve" }],
      plan: { ...PUBLISHER_PLAN, details: lines.join("\n") },
    });
    await settle();

    await type(view, "\u0004");
    await settle();
    expect(view.lastFrame() ?? "").not.toContain("Plan line 0");

    await type(view, "\u0015");
    await settle();
    expect(view.lastFrame() ?? "").toContain("Plan line 0");
    view.unmount();
  });

  it("answers the review from the prompt, not the plan viewport", async () => {
    const { store, view } = mount("publisher");
    const decision = store.request<string>({
      kind: "review",
      message: "Go ahead with this plan?",
      options: [
        { label: "Approve, make these changes", value: "approve" },
        { label: "Abort, change nothing", value: "abort" },
      ],
      plan: PUBLISHER_PLAN,
    });
    await settle();
    await type(view, "\r");

    await expect(decision).resolves.toBe("approve");
    view.unmount();
  });

  it("clears the prompt once it is answered", async () => {
    const { store, view } = mount("publisher");
    const answered = store.request<boolean>({
      kind: "confirm",
      message: "Continue anyway?",
    });
    await settle();
    await type(view, "y");

    await expect(answered).resolves.toBe(true);
    await settle();
    expect(view.lastFrame() ?? "").not.toContain("Continue anyway?");
    view.unmount();
  });

  it("collects what the developer types as feedback", async () => {
    const { store, view } = mount("publisher");
    const typed = store.request<string>({
      kind: "text",
      message: "What should the agent do differently?",
    });
    await settle();
    await type(view, "use src/ads.js\r");

    await expect(typed).resolves.toBe("use src/ads.js");
    view.unmount();
  });

  it.each(["publisher", "advertiser"] as const)(
    "accepts pasted feedback and edits at the cursor in %s mode",
    async (mode) => {
      const { store, view } = mount(mode);
      const typed = store.request<string>({
        kind: "text",
        message: "What should the agent do differently?",
      });
      await settle();
      view.stdin.write("Use purchase in main.mjs");
      await settle();
      expect(view.lastFrame()).toContain("Use purchase in main.mjs");

      view.stdin.write("\u001b[D");
      await settle();
      view.stdin.write("\u007f");
      await settle();
      view.stdin.write("t");
      await settle();
      view.stdin.write("\r");

      await expect(typed).resolves.toBe("Use purchase in main.mts");
      view.unmount();
    }
  );

  it("toggles a placement off with Space before confirming", async () => {
    const { store, view } = mount("publisher");
    const kept = store.request<string[]>({
      initial: ["app/page.tsx", "app/blog/page.tsx"],
      kind: "multiselect",
      message: "Which of these placements should the agent build?",
      options: [
        { label: "app/page.tsx", value: "app/page.tsx" },
        { label: "app/blog/page.tsx", value: "app/blog/page.tsx" },
      ],
    });
    await settle();
    expect(view.lastFrame() ?? "").toContain(
      "Space toggles a placement, Enter confirms."
    );

    // Space drops the highlighted first placement, Enter confirms the rest.
    await type(view, " \r");

    await expect(kept).resolves.toEqual(["app/blog/page.tsx"]);
    view.unmount();
  });

  it("submits the placements it was given as the initial choice", async () => {
    const { store, view } = mount("publisher");
    const kept = store.request<string[]>({
      initial: ["app/page.tsx", "app/blog/page.tsx"],
      kind: "multiselect",
      message: "Which of these placements should the agent build?",
      options: [
        { label: "app/page.tsx", value: "app/page.tsx" },
        { label: "app/blog/page.tsx", value: "app/blog/page.tsx" },
      ],
    });
    await settle();
    await type(view, "\r");

    await expect(kept).resolves.toEqual(["app/page.tsx", "app/blog/page.tsx"]);
    view.unmount();
  });

  it("keeps the prompt on screen when the callouts outgrow the terminal", async () => {
    const { store, view } = mount("publisher");
    store.plan(["One", "Two", "Three", "Four", "Five"], "~/project");
    for (let index = 0; index < 20; index += 1) {
      store.add({ kind: "warn", lines: [`Warning number ${index}`] });
    }
    store.request<boolean>({ kind: "confirm", message: "Continue anyway?" });
    await settle();

    const frame = view.lastFrame() ?? "";
    expect(frame).toContain("Continue anyway?");
    expect(frame).toContain("Warning number 19");
    expect(frame).not.toContain("Warning number 0");
    view.unmount();
  });

  it("gives up the run on Ctrl-C, because raw mode never raises a signal", async () => {
    let aborted = false;
    const { store, view } = mount("publisher", () => {
      aborted = true;
    });
    // The handler goes on before the key is sent: the rejection lands during
    // type(), and attaching after would leave it unhandled for a tick.
    const decision = store
      .request<string>({
        kind: "review",
        message: "Go ahead with this plan?",
        options: [{ label: "Approve, make these changes", value: "approve" }],
        plan: PUBLISHER_PLAN,
      })
      .then(
        () => new Error("the prompt was answered, not cancelled"),
        (reason: unknown) => reason
      );
    await settle();
    await type(view, "\u0003");

    expect(await decision).toBeInstanceOf(WizardCancelled);
    expect(aborted).toBe(true);
    view.unmount();
  });
});
