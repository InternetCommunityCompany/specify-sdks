import { FocusScope, GigglesProvider, useFocusScope, useTheme } from "giggles";
import { Markdown } from "giggles/markdown";
import { useTerminalSize } from "giggles/terminal";
import {
  Confirm,
  MultiSelect,
  Panel,
  Select,
  Spinner,
  spinners,
  TextInput,
  Viewport,
  type ViewportRef,
} from "giggles/ui";
import { Box, Text, useInput, useStdin, useStdout } from "ink";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type {
  Ask,
  Entry,
  Reply,
  Step,
  StepState,
  Task,
  WizardStore,
} from "./store";
import { MOUSE_OFF, MOUSE_ON, wheelTurns } from "./wheel";

/** How many activity lines stay on screen under a running task. */
const TAIL = 5;
/** Rows the panel border, the hint and the margins cost around the plan. */
const PLAN_CHROME_ROWS = 7;
const MIN_PLAN_ROWS = 5;
const DEFAULT_ROWS = 24;
const MIN_WIDTH = 40;
const DEFAULT_WIDTH = 80;
const PROMPT_KEY = "prompt";
/** Lines one wheel notch moves the plan. */
const WHEEL_LINES = 2;

const ELLIPSIS = "…";
/** Rows the header and the checklist keep for themselves. */
const HEADER_ROWS = 2;

/** One line, cut to the width it has, so nothing wraps and breaks the layout. */
function clamp(text: string, width: number): string {
  return text.length > width
    ? `${text.slice(0, Math.max(1, width - 1))}${ELLIPSIS}`
    : text;
}

function Header({ subtitle, width }: { subtitle?: string; width: number }) {
  return (
    <Box justifyContent="space-between" marginBottom={1} width={width}>
      <Text bold>Specify publisher SDK</Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}

/**
 * The whole run as a checklist.
 *
 * Every step is on screen from the start and only its state moves, so the
 * developer can see where they are and what is still to come without the
 * screen growing under them.
 */
function Checklist({ steps, width }: { steps: Step[]; width: number }) {
  const theme = useTheme();
  const mark: Record<StepState, { color?: string; symbol: string }> = {
    active: { color: theme.accentColor, symbol: theme.indicator },
    done: { color: theme.selectedColor, symbol: theme.checkedIndicator },
    failed: { color: "red", symbol: "✗" },
    pending: { symbol: theme.uncheckedIndicator },
  };
  return (
    <Box flexDirection="column">
      {steps.map((step) => {
        const { color, symbol } = mark[step.state];
        const quiet = step.state === "pending";
        return (
          <Text key={step.title} wrap="truncate">
            <Text color={color} dimColor={quiet}>
              {symbol}
            </Text>{" "}
            <Text bold={step.state === "active"} dimColor={quiet}>
              {step.title}
            </Text>
            {step.detail ? (
              <Text dimColor> — {clamp(step.detail, width / 2)}</Text>
            ) : null}
          </Text>
        );
      })}
    </Box>
  );
}

const CALLOUT_COLOR = { error: "red", note: "gray", warn: "yellow" } as const;

function Callout({ entry, width }: { entry: Entry; width: number }) {
  const color = CALLOUT_COLOR[entry.kind];
  const loud = entry.kind !== "note";
  return (
    <Box
      borderColor={color}
      borderStyle="round"
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      width={width}
    >
      {entry.kind === "note" ? (
        <Text bold dimColor>
          {entry.title}
        </Text>
      ) : null}
      {entry.lines.map((line) => (
        <Text color={loud ? color : undefined} dimColor={!loud} key={line}>
          {clamp(line, width - 4)}
        </Text>
      ))}
    </Box>
  );
}

function Running({ task, width }: { task: Task; width: number }) {
  const theme = useTheme();
  const tail = task.lines.slice(-TAIL);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Spinner color={theme.accentColor} spinner={spinners.dot} />{" "}
        <Text bold>{task.title}</Text>
        {task.lines.length > 0 ? (
          <Text dimColor> · {task.lines.length} steps</Text>
        ) : null}
      </Text>
      <Box flexDirection="column" marginLeft={2}>
        {tail.map((line, index) => (
          <Text dimColor key={`${index}-${line}`} wrap="truncate">
            {clamp(line, width - 4)}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/**
 * The mouse wheel, scrolling the plan.
 *
 * Without this the terminal translates the wheel into arrow keys, which
 * belong to the decision under the plan — so scrolling would move the
 * selection instead. Reporting is turned on only while the review is up and
 * turned off the moment it unmounts, and a terminal without mouse support
 * ignores the whole thing and keeps its old behaviour.
 */
function useWheel(onTurns: (turns: number) => void) {
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const turn = useRef(onTurns);
  turn.current = onTurns;

  useEffect(() => {
    stdout.write(MOUSE_ON);
    const onData = (chunk: Buffer | string) => {
      const turns = wheelTurns(String(chunk));
      if (turns !== 0) {
        turn.current(turns);
      }
    };
    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
      stdout.write(MOUSE_OFF);
    };
  }, [stdin, stdout]);
}

/**
 * The plan, with the decision under it.
 *
 * The prompt holds focus so the arrow keys pick a decision, and the plan
 * scrolls separately: the wheel, the page keys, or Ctrl-U and Ctrl-D for a
 * keyboard without page keys. An unhandled key rises from the prompt to this
 * scope, so the two never fight over the same key.
 */
function Review({
  answer,
  ask,
  rows,
  width,
}: {
  answer: (reply: Reply) => void;
  ask: Extract<Ask, { kind: "review" }>;
  rows: number;
  width: number;
}) {
  const viewport = useRef<ViewportRef>(null);
  // Whatever sits under the plan does not get. The plan scrolls in the rest.
  const height = Math.max(
    MIN_PLAN_ROWS,
    rows - ask.options.length - PLAN_CHROME_ROWS
  );
  const scope = useFocusScope({
    keybindings: {
      "ctrl+d": () => viewport.current?.scrollBy(height),
      "ctrl+u": () => viewport.current?.scrollBy(-height),
      pagedown: () => viewport.current?.scrollBy(height),
      pageup: () => viewport.current?.scrollBy(-height),
    },
  });
  useWheel((turns) => viewport.current?.scrollBy(turns * WHEEL_LINES));

  useEffect(() => {
    scope.focusChild(PROMPT_KEY);
  }, [scope]);

  return (
    <FocusScope handle={scope}>
      <Panel title="Integration plan" width={width}>
        <Viewport height={height} keybindings={false} ref={viewport}>
          <Markdown>{ask.plan.details}</Markdown>
        </Viewport>
      </Panel>
      <Box marginTop={1}>
        <Text dimColor>
          Scroll the plan: mouse wheel, PgUp/PgDn, or Ctrl-U/Ctrl-D.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Select<string>
          focusKey={PROMPT_KEY}
          label={ask.message}
          onSubmit={answer}
          options={ask.options}
        />
      </Box>
    </FocusScope>
  );
}

function Prompt({ ask, answer }: { ask: Ask; answer: (reply: Reply) => void }) {
  const [draft, setDraft] = useState("");

  if (ask.kind === "confirm") {
    return <Confirm message={ask.message} onSubmit={answer} />;
  }
  if (ask.kind === "text") {
    return (
      <TextInput
        label={ask.message}
        onChange={setDraft}
        onSubmit={answer}
        placeholder={ask.placeholder}
        value={draft}
      />
    );
  }
  if (ask.kind === "multiselect") {
    return (
      <MultiSelect<string>
        label={ask.message}
        onSubmit={answer}
        options={ask.options}
        value={ask.initial}
      />
    );
  }
  return (
    <Select<string>
      label={ask.message}
      onSubmit={answer}
      options={(ask as Extract<Ask, { kind: "select" }>).options}
    />
  );
}

/** How many rows a callout costs, so the tail can be trimmed to what fits. */
function entryRows(entry: Entry): number {
  return entry.lines.length + (entry.kind === "note" ? 4 : 3);
}

/** How many rows the open prompt needs under everything else. */
function askRows(ask: Ask): number {
  if (ask.kind === "select" || ask.kind === "multiselect") {
    return ask.options.length + 2;
  }
  return 2;
}

/** The newest callouts that fit the rows they are given. */
function fitting(entries: Entry[], budget: number): Entry[] {
  const shown: Entry[] = [];
  let used = 0;
  for (const entry of [...entries].reverse()) {
    used += entryRows(entry);
    if (used > budget) {
      break;
    }
    shown.unshift(entry);
  }
  return shown;
}

function Screen({ store }: { store: WizardStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const size = useTerminalSize();
  const rows = size.rows || DEFAULT_ROWS;
  const width = Math.max(MIN_WIDTH, (size.columns || DEFAULT_WIDTH) - 2);

  // The plan is the whole screen while it is being read; there is nothing
  // beside it worth crowding it out.
  if (state.ask?.kind === "review") {
    return (
      <Box flexDirection="column" height={rows} paddingX={1}>
        <Header subtitle={state.where} width={width} />
        <Review
          answer={store.answer}
          ask={state.ask}
          rows={rows - HEADER_ROWS}
          width={width}
        />
      </Box>
    );
  }

  const asking = state.ask ? askRows(state.ask) + 1 : 0;
  const running = state.task ? Math.min(state.task.lines.length, TAIL) + 3 : 0;
  const spent = HEADER_ROWS + state.steps.length + asking + running;
  const entries = fitting(state.entries, Math.max(0, rows - spent - 1));

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Header subtitle={state.where} width={width} />
      <Checklist steps={state.steps} width={width} />
      {entries.map((entry, index) => (
        <Callout entry={entry} key={`${index}-${entry.kind}`} width={width} />
      ))}
      {state.task ? <Running task={state.task} width={width} /> : null}
      {state.ask ? (
        <Box marginTop={1}>
          <Prompt answer={store.answer} ask={state.ask} />
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Ctrl-C, which raw mode never turns into a signal, so it arrives as a byte
 * like any other key and has to be watched for here.
 */
function Cancelling({ store }: { store: WizardStore }) {
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      store.cancel();
    }
  });
  return null;
}

/**
 * The whole wizard screen.
 *
 * @param props The store the tree reads and answers through.
 * @returns The Ink tree.
 */
export function App({ store }: { store: WizardStore }) {
  return (
    <GigglesProvider fullScreen>
      <Cancelling store={store} />
      <Screen store={store} />
    </GigglesProvider>
  );
}
