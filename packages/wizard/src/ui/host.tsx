import type { Readable, Writable } from "node:stream";
import { render } from "ink";
import type { Plan } from "../plan";
import { App } from "./app";
import type { Choice } from "./store";
import { WizardStore } from "./store";

/** What the wizard flow drives. One prompt is open at a time, by construction. */
export interface Ui {
  /** A line under the running task. */
  activity: (line: string) => void;
  /** Marks the step under way. */
  begin: (index: number) => void;
  /** Drops the callouts, once what they were warning about is settled. */
  clear: () => void;
  /** Ends the run and prints the durable record to the real screen. */
  close: () => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
  /** A failure the run cannot continue past. */
  error: (lines: string[]) => void;
  /** Marks the step failed, with why. */
  fail: (index: number, detail?: string) => void;
  /** Marks the step done, with what came of it. */
  finish: (index: number, detail?: string) => void;
  /** Kept for after the alternate screen is gone. */
  keep: (text: string) => void;
  multiselect: (
    message: string,
    options: Choice[],
    initial: string[]
  ) => Promise<string[]>;
  note: (title: string, lines: string[]) => void;
  /** Lays out the checklist, and names the project, before the run starts. */
  plan: (titles: string[], where: string) => void;
  review: (plan: Plan, message: string, options: Choice[]) => Promise<string>;
  select: (message: string, options: Choice[]) => Promise<string>;
  startTask: (title: string) => void;
  stopTask: () => void;
  text: (message: string, placeholder?: string) => Promise<string>;
  warn: (lines: string[]) => void;
}

interface HostOptions {
  input: Readable;
  /** Called when the developer presses Ctrl-C, before the run unwinds. */
  onCancel?: () => void;
  output: Writable;
}

/**
 * Starts the wizard's screen and hands back the imperative surface the flow
 * drives it through.
 *
 * The alternate screen the TUI runs in is discarded on exit, so anything the
 * developer still needs afterwards is buffered with `keep` and written to the
 * real screen once the tree is unmounted.
 *
 * @param options The streams to render to and read keys from.
 * @returns The wizard's UI.
 */
export function startUi(options: HostOptions): Ui {
  const store = new WizardStore(options.onCancel);
  const record: string[] = [];

  const instance = render(<App store={store} />, {
    exitOnCtrlC: false,
    stdin: options.input as NodeJS.ReadStream,
    stdout: options.output as NodeJS.WriteStream,
  });

  return {
    activity: (line) => store.addLine(line),
    begin: (index) => store.beginStep(index),
    clear: () => store.clear(),
    close() {
      // Unmounting runs React's cleanup synchronously, which is what restores
      // the terminal from the alternate screen, so the record written straight
      // after it lands on the screen the developer is left looking at. Ink's
      // waitUntilExit() never settles for an unmount we asked for ourselves,
      // so waiting on it here would hang the wizard on its last line.
      instance.unmount();
      if (record.length > 0) {
        options.output.write(`${record.join("\n")}\n`);
      }
      // Ink leaves stdin resumed, and a resumed stdin keeps Node alive.
      options.input.pause();
      return Promise.resolve();
    },
    confirm: (message) => store.request<boolean>({ kind: "confirm", message }),
    error: (lines) => store.add({ kind: "error", lines }),
    fail: (index, detail) => {
      store.endTask();
      store.failStep(index, detail);
    },
    finish: (index, detail) => {
      store.endTask();
      store.finishStep(index, detail);
    },
    keep: (text) => record.push(text),
    multiselect: (message, choices, initial) =>
      store.request<string[]>({
        initial,
        kind: "multiselect",
        message,
        options: choices,
      }),
    note: (title, lines) => store.add({ kind: "note", lines, title }),
    plan: (titles, where) => store.plan(titles, where),
    review: (plan, message, choices) =>
      store.request<string>({
        kind: "review",
        message,
        options: choices,
        plan,
      }),
    select: (message, choices) =>
      store.request<string>({ kind: "select", message, options: choices }),
    startTask: (title) => store.startTask(title),
    stopTask: () => store.endTask(),
    text: (message, placeholder) =>
      store.request<string>({ kind: "text", message, placeholder }),
    warn: (lines) => store.add({ kind: "warn", lines }),
  };
}
