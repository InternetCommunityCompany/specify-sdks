import { create, detect } from "anyagent-js";
import type { DetectResult, Session } from "anyagent-js/types";

export interface DetectedAgent {
  id: string;
  name: string;
  version?: string;
}

export type AgentActivity =
  | { kind: "tool"; input: unknown; name: string }
  | {
      kind: "file";
      change: "create" | "modify" | "delete";
      path: string;
    };

export interface TurnOptions {
  onActivity?: (activity: AgentActivity) => void;
  /** A JSON Schema the reply has to match, landing on `AgentReply.json`. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AgentReply {
  /** The reply parsed and validated, when the turn asked for a schema. */
  json?: unknown;
  text: string;
}

export interface AgentConversation {
  /** A turn whose reply the wizard reads. */
  ask: (prompt: string, opts?: TurnOptions) => Promise<AgentReply>;
  close: () => Promise<void>;
  /** A turn that changes the project. */
  work: (prompt: string, opts?: TurnOptions) => Promise<AgentReply>;
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
      onActivity?.({ input: event.input, kind: "tool", name: event.name });
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

function conversation(session: Session): AgentConversation {
  // Every turn reads the published documentation over the network, which the
  // read-only modes of several agents deny along with writing, so no turn asks
  // for one. The recon prompt says to report without changing anything.
  async function turn(prompt: string, opts?: TurnOptions): Promise<AgentReply> {
    try {
      const run = session.run(prompt, {
        ...(opts?.schema ? { schema: opts.schema } : {}),
        signal: opts?.signal,
      });
      const result = await finishRun(run, session, opts?.onActivity);
      return { json: result.json, text: result.text };
    } catch (error) {
      throw publicError(TURN_ERROR, error);
    }
  }

  return {
    ask: turn,
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
    work: turn,
  };
}

export function anyAgentSeam(): AgentSeam {
  const detectedResults = new WeakMap<DetectedAgent, DetectResult>();

  return {
    async detect() {
      try {
        const results = await detect();
        return results.map((result) => {
          const detected: DetectedAgent = {
            id: result.id,
            name: result.name,
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
        return conversation(create(result).session({ cwd }));
      } catch (error) {
        throw publicError(
          `Could not start ${agent.name}. Check that it is installed and authenticated, then try again.`,
          error
        );
      }
    },
  };
}
