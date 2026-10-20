import { Console } from "node:console";
import process from "node:process";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startUi, type Ui } from "../src/ui/host";
import { MOUSE_OFF, MOUSE_ON } from "../src/ui/wheel";

const HEADER = "Specify publisher SDK";
const PLAN = {
  details: "## What I found\n\nA Next.js app.",
  suggestions: [],
  summary: "A Next.js app.",
};

class TerminalInput extends PassThrough {
  isRaw = false;
  readonly isTTY = true;

  ref(): this {
    return this;
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }

  unref(): this {
    return this;
  }
}

class TerminalOutput extends Writable {
  readonly columns = 100;
  readonly isTTY = true;
  readonly rows = 30;
  readonly writes: string[] = [];

  override _write(chunk: unknown, _encoding: string, done: () => void): void {
    this.writes.push(String(chunk));
    done();
  }
}

// In CI Ink writes only the last screen, on unmount; elsewhere it repaints on
// every change.
function lastScreen(writes: string[]): string {
  return [...writes].reverse().find((write) => write.includes(HEADER)) ?? "";
}

/** React applies store changes on a later microtask; closing first loses them. */
function rendered(): Promise<void> {
  return new Promise((settled) => setImmediate(settled));
}

const { columns, rows } = process.stdout;
let input: TerminalInput;
let output: TerminalOutput;
let ui: Ui;

beforeEach(async () => {
  // Ink patches the console through console.Console, which Vitest's lacks.
  Object.assign(console, { Console });
  // The app sizes itself from process.stdout, whatever stream Ink draws to.
  process.stdout.columns = 100;
  process.stdout.rows = 30;
  input = new TerminalInput();
  output = new TerminalOutput();
  ui = startUi({ input, mode: "publisher", output });
  // Raw mode goes on once the tree has mounted and is listening for keys.
  await vi.waitFor(() => expect(input.isRaw).toBe(true));
});

afterEach(async () => {
  await ui.close();
  process.stdout.columns = columns;
  process.stdout.rows = rows;
});

describe("startUi", () => {
  it("writes what was kept after the unmount has restored the terminal", async () => {
    const record =
      "Changes\nlib/specify.ts\nRead the changes, then run your app.\n";
    ui.review(PLAN, "Go ahead with this plan?", [
      { label: "Approve, make these changes", value: "approve" },
    ]);
    await vi.waitFor(() => expect(output.writes).toContain(MOUSE_ON));
    ui.keep("Changes\nlib/specify.ts");
    ui.keep("Read the changes, then run your app.");
    expect(output.writes).not.toContain(record);

    await ui.close();

    const unmounted = output.writes.lastIndexOf(MOUSE_OFF);
    expect(unmounted).toBeGreaterThan(-1);
    expect(output.writes.indexOf(record)).toBeGreaterThan(unmounted);
  });

  it("keeps the running task on screen until its step settles", async () => {
    ui.plan(["Read the project"], "~/project");
    ui.begin(0);
    ui.startTask("Scanning files");
    ui.activity("Read package.json");
    await rendered();

    await ui.close();

    expect(lastScreen(output.writes)).toContain("Scanning files");
    expect(lastScreen(output.writes)).toContain("Read package.json");
  });

  it.each([
    { end: (screen: Ui) => screen.finish(0, "3 files"), name: "finish" },
    { end: (screen: Ui) => screen.fail(0, "3 files"), name: "fail" },
  ])("ends the running task on $name", async ({ end }) => {
    ui.plan(["Read the project"], "~/project");
    ui.begin(0);
    ui.startTask("Scanning files");
    ui.activity("Read package.json");
    end(ui);
    await rendered();

    await ui.close();

    const screen = lastScreen(output.writes);
    expect(screen).toContain("3 files");
    expect(screen).not.toContain("Scanning files");
    expect(screen).not.toContain("Read package.json");
  });

  it("pauses stdin, which Ink leaves flowing, so it stops holding Node open", async () => {
    await ui.close();
    // Ink releases stdin a tick after close.
    await rendered();

    expect(input.isPaused()).toBe(true);
  });
});
