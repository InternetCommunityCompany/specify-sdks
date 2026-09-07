// Wide enough to read, narrow enough that an 80-column terminal renders a
// clack note without rewrapping it and losing the shape of the markdown.
const BODY_WIDTH = 64;
// A nested list item can be indented far enough that the remaining width
// would leave a column too narrow to read.
const MIN_WIDTH = 24;
const LEADING_SPACE = /^\s*/;
const LIST_MARKER = /^\s*[-*+]\s+/;
const WHITESPACE = /\s+/;

function wrap(line: string): string[] {
  // A wrapped list item hangs under its own text, not under its bullet.
  const marker =
    line.match(LIST_MARKER)?.[0] ?? line.match(LEADING_SPACE)?.[0] ?? "";
  const words = line.slice(marker.length).split(WHITESPACE).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }
  const width = Math.max(BODY_WIDTH - marker.length, MIN_WIDTH);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && `${current} ${word}`.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  lines.push(current);
  const continuation = " ".repeat(marker.length);
  return lines.map(
    (text, index) => `${index === 0 ? marker : continuation}${text}`
  );
}

/**
 * The plan as the developer reads it before approving anything.
 *
 * @param plan The plan markdown the agent replied with.
 * @returns The body for a `note()`, with long lines folded under their own
 * indent.
 */
export function renderPlan(plan: string): string {
  return plan.trim().split("\n").flatMap(wrap).join("\n");
}
