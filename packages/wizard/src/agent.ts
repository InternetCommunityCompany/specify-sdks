import { create, detect } from "anyagent-js";
import type { DetectResult, Session } from "anyagent-js/types";

export interface DetectedAgent {
  id: string;
  name: string;
  supportsReadOnly: boolean;
  version?: string;
}

export type AgentActivity =
  | { kind: "tool"; name: string }
  | {
      kind: "file";
      change: "create" | "modify" | "delete";
      path: string;
    };

export interface TurnOptions {
  onActivity?: (activity: AgentActivity) => void;
  readOnly?: boolean;
  signal?: AbortSignal;
}

export interface AgentConversation {
  ask: (
    prompt: string,
    schema: Record<string, unknown>,
    opts?: TurnOptions
  ) => Promise<unknown>;
  close: () => Promise<void>;
  work: (prompt: string, opts?: TurnOptions) => Promise<string>;
}

export interface AgentSeam {
  detect: () => Promise<DetectedAgent[]>;
  /** The agent must be one of the exact objects returned by detect, not a copy. */
  open: (agent: DetectedAgent, cwd: string) => AgentConversation;
}

const DETECT_ERROR =
  "Could not detect coding agents. Check that your coding agent is installed and available on PATH, then try again.";
const TURN_ERROR =
  "The coding agent could not complete the request. Check its authentication and try again.";

function publicError(message: string, cause?: unknown): Error {
  return new Error(message, { cause });
}

async function finishRun(
  run: ReturnType<Session["run"]>,
  session: Session,
  onActivity?: (activity: AgentActivity) => void
) {
  for await (const event of run) {
    if (event.type === "tool-call") {
      onActivity?.({ kind: "tool", name: event.name });
    } else if (event.type === "file-change") {
      onActivity?.({
        change: event.kind,
        kind: "file",
        path: event.path,
      });
    } else if (
      event.type === "permission-request" &&
      session.supports("respond")
    ) {
      session.respond(event.requestId, "allow");
    }
  }
  return await run;
}

function conversation(
  session: Session,
  supportsReadOnly: boolean
): AgentConversation {
  return {
    async ask(prompt, schema, opts) {
      try {
        const run = session.run(prompt, {
          schema,
          signal: opts?.signal,
          ...(supportsReadOnly ? { readOnly: opts?.readOnly } : {}),
        });
        const result = await finishRun(run, session, opts?.onActivity);
        return result.json;
      } catch (error) {
        throw publicError(TURN_ERROR, error);
      }
    },
    async close() {
      try {
        await session.close();
      } catch (error) {
        throw publicError(
          "Could not close the coding agent session. Stop the coding agent and try again.",
          error
        );
      }
    },
    async work(prompt, opts) {
      try {
        const run = session.run(prompt, { signal: opts?.signal });
        const result = await finishRun(run, session, opts?.onActivity);
        return result.text;
      } catch (error) {
        throw publicError(TURN_ERROR, error);
      }
    },
  };
}

export function anyAgentSeam(): AgentSeam {
  const detectedResults = new WeakMap<DetectedAgent, DetectResult>();

  return {
    async detect() {
      try {
        const results = await detect();
        return results.map((result) => {
          const agent = create(result);
          const detected: DetectedAgent = {
            id: result.id,
            name: result.name,
            supportsReadOnly: agent.supports("readOnly"),
            ...(result.version ? { version: result.version } : {}),
          };
          detectedResults.set(detected, result);
          return detected;
        });
      } catch (error) {
        throw publicError(DETECT_ERROR, error);
      }
    },
    open(agent, cwd) {
      const result = detectedResults.get(agent);
      if (!result) {
        throw publicError(
          "Could not start the coding agent. Detect installed agents again, then retry."
        );
      }

      try {
        const runnableAgent = create(result);
        return conversation(
          runnableAgent.session({ cwd }),
          runnableAgent.supports("readOnly")
        );
      } catch (error) {
        throw publicError(
          `Could not start ${agent.name}. Check that it is installed and authenticated, then try again.`,
          error
        );
      }
    },
  };
}
