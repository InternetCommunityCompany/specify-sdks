import type { AgentActivity } from "./agent";

/**
 * anyagent's normalized tool names, in the past tense a finished step reads
 * best in ("Read package.json"). A name we do not know — an MCP tool, a
 * harness extra — passes through as itself rather than being hidden.
 */
const TOOL_VERBS: Record<string, string> = {
  bash: "Ran",
  edit: "Edited",
  glob: "Found",
  grep: "Searched",
  read: "Read",
  webSearch: "Searched the web for",
  write: "Wrote",
};

const FILE_VERBS = {
  create: "Created",
  delete: "Deleted",
  modify: "Edited",
} as const;

// Long enough to name a path or a command, short enough that the line still
// fits a narrow terminal beside its verb.
const DETAIL_MAX = 72;
const ELLIPSIS = "…";
const NEWLINES = /\s*\n\s*/g;

function shorten(text: string): string {
  const flat = text.replace(NEWLINES, " ").trim();
  return flat.length > DETAIL_MAX
    ? `${flat.slice(0, DETAIL_MAX - 1)}${ELLIPSIS}`
    : flat;
}

/** Paths read better relative to the project the developer is standing in. */
function relativize(text: string, cwd: string): string {
  return cwd ? text.replaceAll(`${cwd}/`, "") : text;
}

/**
 * The part of a tool's input worth showing: the file it touched, the command
 * it ran, or the pattern it searched for.
 */
function detail(input: unknown, cwd: string): string {
  if (typeof input === "string") {
    return shorten(relativize(input, cwd));
  }
  if (!input || typeof input !== "object") {
    return "";
  }
  const record = input as Record<string, unknown>;
  const interesting =
    record.path ?? record.file_path ?? record.command ?? record.pattern;
  return typeof interesting === "string"
    ? shorten(relativize(interesting, cwd))
    : "";
}

/**
 * One activity as a line for the log.
 *
 * @param activity What the agent just did.
 * @param cwd The project directory, so paths inside it read as relative.
 * @returns The line to show.
 */
export function describeActivity(activity: AgentActivity, cwd: string): string {
  if (activity.kind === "file") {
    return `${FILE_VERBS[activity.change]} ${relativize(activity.path, cwd)}`;
  }
  const verb = TOOL_VERBS[activity.name] ?? activity.name;
  const what = detail(activity.input, cwd);
  return what ? `${verb} ${what}` : verb;
}

export interface Narrator {
  /** What the turn did, once it is over. */
  summary: () => string;
  /** The line for one activity, counted towards the summary. */
  take: (activity: AgentActivity) => string;
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

/**
 * Turns a turn's activity into lines to show while it runs and one sentence
 * describing it once it is done.
 *
 * The summary counts distinct files rather than file events, because an agent
 * that edits the same file four times has still only changed one file, and a
 * developer reading the summary is deciding what to review.
 *
 * @param cwd The project directory the agent is working in.
 * @returns A narrator for a single turn.
 */
export function createNarrator(cwd: string): Narrator {
  const files = new Set<string>();
  let steps = 0;

  return {
    summary() {
      const parts = [count(steps, "step", "steps")];
      if (files.size > 0) {
        parts.push(count(files.size, "file", "files"));
      }
      return parts.join(", ");
    },
    take(activity) {
      steps += 1;
      if (activity.kind === "file") {
        files.add(activity.path);
      }
      return describeActivity(activity, cwd);
    },
  };
}
