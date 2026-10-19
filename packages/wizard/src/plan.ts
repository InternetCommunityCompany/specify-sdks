import type { SdkMode } from "./sdk";

/** One place the agent proposes putting an ad. */
export interface Placement {
  file: string;
  reason: string;
}

/** What the agent reports back before anything is written. */
export interface Plan {
  details: string;
  suggestions: string[];
  summary: string;
}

/** What the developer kept from the agent's suggestions. */
export interface ChosenSuggestions {
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
export const PUBLISHER_PLAN_SCHEMA = {
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

export const ADVERTISER_PLAN_SCHEMA = {
  additionalProperties: false,
  properties: {
    details: {
      description:
        "The plan itself, as markdown: what you found, what you would change, and anything the developer should know before approving. Use headings and lists. Do not include your own progress commentary, and do not list events here — propose those only in the events field, because the wizard presents them to the developer separately.",
      type: "string",
    },
    events: {
      description:
        "Every product event you propose capturing. Empty if this project has no sensible events to capture.",
      items: {
        additionalProperties: false,
        properties: {
          file: {
            description:
              "The file the event capture would go in, as a path from the project root.",
            type: "string",
          },
          name: {
            description: "The event name to pass to the SDK.",
            type: "string",
          },
          reason: {
            description:
              "One short line on why this event, for the developer to choose from.",
            type: "string",
          },
          trigger: {
            description:
              "When to capture this event, including whether it runs in the browser or on the server.",
            type: "string",
          },
        },
        required: ["file", "name", "reason", "trigger"],
        type: "object",
      },
      type: "array",
    },
    summary: PUBLISHER_PLAN_SCHEMA.properties.summary,
  },
  required: ["details", "events", "summary"],
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

function eventLabel(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const { file, name, reason, trigger } = value as Record<string, unknown>;
  const path = text(file);
  const event = text(name);
  const when = text(trigger);
  if (!(path && event && when)) {
    return;
  }
  return [event, path, when, text(reason)].filter(Boolean).join(" - ");
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
 * @param mode The SDK the plan describes.
 * @returns The plan, or `undefined` when there is nothing worth showing.
 */
export function readPlan(reply: unknown, mode: SdkMode): Plan | undefined {
  if (typeof reply !== "object" || reply === null) {
    return;
  }
  const { details, events, placements, summary } = reply as Record<
    string,
    unknown
  >;
  const body = text(details);
  if (!body) {
    return;
  }
  const suggestions: string[] = [];
  if (mode === "advertiser" && Array.isArray(events)) {
    for (const entry of events) {
      const label = eventLabel(entry);
      if (label) {
        suggestions.push(label);
      }
    }
  } else if (mode === "publisher" && Array.isArray(placements)) {
    for (const entry of placements) {
      const placement = placementOf(entry);
      if (placement) {
        suggestions.push(placementLabel(placement));
      }
    }
  }
  return {
    details: body,
    suggestions,
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
