/** One place the agent proposes putting an ad. */
export interface Placement {
  file: string;
  reason: string;
}

/** What the agent reports back before anything is written. */
export interface Plan {
  details: string;
  placements: Placement[];
  summary: string;
}

/** What the developer kept from the placements the agent suggested. */
export interface ChosenPlacements {
  dropped: string[];
  kept: string[];
}

/**
 * The shape the plan turn has to answer in.
 *
 * `details` stays free-form markdown so the agent can structure the plan the
 * way the project needs. The value of the schema is the split: the agent's
 * running commentary can no longer end up concatenated onto the front of the
 * plan, and placements arrive as data instead of headings to scrape.
 */
export const PLAN_SCHEMA = {
  additionalProperties: false,
  properties: {
    details: {
      description:
        "The plan itself, as markdown: what you found, what you would change, and anything the developer should know before approving. Use headings and lists. Do not include your own progress commentary, and do not list ad placements here — propose those only in the placements field, because the wizard presents them to the developer separately.",
      type: "string",
    },
    placements: {
      description:
        "Every place you propose putting an ad. Empty if this project has nowhere sensible for one.",
      items: {
        additionalProperties: false,
        properties: {
          file: {
            description:
              "The file the ad would go in, as a path from the project root.",
            type: "string",
          },
          reason: {
            description:
              "One short line on why this spot, for the developer to choose from.",
            type: "string",
          },
        },
        required: ["file", "reason"],
        type: "object",
      },
      type: "array",
    },
    summary: {
      description:
        "One sentence naming what this project is and what you would add to it.",
      type: "string",
    },
  },
  required: ["details", "placements", "summary"],
  type: "object",
} as const satisfies Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function placementOf(value: unknown): Placement | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const { file, reason } = value as Record<string, unknown>;
  const path = text(file);
  return path ? { file: path, reason: text(reason) } : undefined;
}

/**
 * The plan a turn replied with, or nothing if it did not answer in the shape
 * that was asked for.
 *
 * The reply is validated against the schema before it reaches here, so this
 * guards only against an agent whose structured output was emulated well
 * enough to parse but not well enough to be useful.
 *
 * @param reply The validated JSON value from the turn.
 * @returns The plan, or `undefined` when there is nothing worth showing.
 */
export function readPlan(reply: unknown): Plan | undefined {
  if (typeof reply !== "object" || reply === null) {
    return;
  }
  const { details, placements, summary } = reply as Record<string, unknown>;
  const body = text(details);
  if (!body) {
    return;
  }
  return {
    details: body,
    placements: Array.isArray(placements)
      ? placements.flatMap((entry) => placementOf(entry) ?? [])
      : [],
    summary: text(summary),
  };
}

/**
 * How one placement reads in the picker and in the implement prompt.
 *
 * @param placement The placement to label.
 * @returns The file, and the reason when the agent gave one.
 */
export function placementLabel(placement: Placement): string {
  return placement.reason
    ? `${placement.file} - ${placement.reason}`
    : placement.file;
}
