import type { Plan } from "../plan";

export interface Choice {
  label: string;
  value: string;
}

/** The one thing the wizard is waiting on the developer for, if any. */
export type Ask =
  | { kind: "confirm"; message: string }
  | { kind: "review"; message: string; options: Choice[]; plan: Plan }
  | { kind: "select"; message: string; options: Choice[] }
  | {
      kind: "multiselect";
      initial: string[];
      message: string;
      options: Choice[];
    }
  | { kind: "text"; message: string; placeholder?: string };

export interface Task {
  /** Newest last. The view shows the tail that fits. */
  lines: string[];
  title: string;
}

/** A callout beside the checklist: the opening contract, or a warning. */
export type Entry =
  | { kind: "error"; lines: string[] }
  | { kind: "note"; lines: string[]; title: string }
  | { kind: "warn"; lines: string[] };

export type StepState = "active" | "done" | "failed" | "pending";

/** One row of the checklist. The set is fixed; only the state moves. */
export interface Step {
  /** What came of it, once it is over. */
  detail?: string;
  state: StepState;
  title: string;
}

export interface State {
  ask?: Ask;
  entries: Entry[];
  steps: Step[];
  task?: Task;
  /** The project being worked in, kept in view for the whole run. */
  where?: string;
}

type Listener = () => void;

/** What a prompt hands back, whichever kind it was. */
export type Reply = boolean | string | string[];

/** Ctrl-C, raised out of whichever prompt was open at the time. */
export class WizardCancelled extends Error {}

/**
 * The wizard's screen state, and the one question it is waiting on.
 *
 * The flow in `wizard.ts` stays a plain async function and pushes state here;
 * the Ink tree only ever reads it and answers through `answer`. Nothing about
 * a run is held anywhere else, and the store is created per run rather than at
 * module scope.
 */
export class WizardStore {
  private readonly listeners = new Set<Listener>();
  private state: State = { entries: [], steps: [] };
  private pending: ((reply: Reply) => void) | undefined;
  private abandon: ((reason: Error) => void) | undefined;
  private readonly onCancel: (() => void) | undefined;

  /** @param onCancel Told first, so a turn in flight is stopped too. */
  constructor(onCancel?: () => void) {
    this.onCancel = onCancel;
  }

  getState = (): State => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Answers the open prompt. Bound, so it can be handed straight to a view. */
  answer = (reply: Reply): void => {
    const settle = this.pending;
    this.pending = undefined;
    this.abandon = undefined;
    this.ask(undefined);
    settle?.(reply);
  };

  /**
   * Gives up on the run. Raw mode means Ctrl-C never reaches the process as a
   * signal, so the keystroke is routed here instead and raised out of whatever
   * the wizard was waiting on.
   */
  cancel = (): void => {
    const give = this.abandon;
    this.pending = undefined;
    this.abandon = undefined;
    this.onCancel?.();
    this.ask(undefined);
    give?.(new WizardCancelled("Stopped. Nothing was changed."));
  };

  private set(next: State): void {
    this.state = next;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  /** Drops the callouts, once what they were warning about is settled. */
  clear(): void {
    this.set({ ...this.state, entries: [] });
  }

  add(entry: Entry): void {
    this.set({ ...this.state, entries: [...this.state.entries, entry] });
  }

  /** Lays out the whole checklist up front, so the shape of the run is known. */
  plan(titles: string[], where: string): void {
    this.set({
      ...this.state,
      steps: titles.map((title) => ({ state: "pending", title })),
      where,
    });
  }

  private step(index: number, step: Partial<Step>): void {
    this.set({
      ...this.state,
      steps: this.state.steps.map((current, at) =>
        at === index ? { ...current, ...step } : current
      ),
    });
  }

  beginStep(index: number): void {
    this.step(index, { state: "active" });
  }

  finishStep(index: number, detail?: string): void {
    this.step(index, { detail, state: "done" });
  }

  failStep(index: number, detail?: string): void {
    this.step(index, { detail, state: "failed" });
  }

  ask(ask: Ask | undefined): void {
    this.set({ ...this.state, ask });
  }

  /** Opens a prompt and resolves once the developer answers it. */
  request<Value extends Reply>(ask: Ask): Promise<Value> {
    return new Promise<Value>((resolve, reject) => {
      this.pending = resolve as (reply: Reply) => void;
      this.abandon = reject;
      this.ask(ask);
    });
  }

  startTask(title: string): void {
    this.set({ ...this.state, task: { lines: [], title } });
  }

  addLine(line: string): void {
    const { task } = this.state;
    if (!task) {
      return;
    }
    this.set({
      ...this.state,
      task: { ...task, lines: [...task.lines, line] },
    });
  }

  endTask(): void {
    this.set({ ...this.state, task: undefined });
  }
}
