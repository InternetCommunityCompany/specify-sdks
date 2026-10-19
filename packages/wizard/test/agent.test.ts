import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  detect: vi.fn(),
}));

vi.mock("anyagent-js", () => mocks);

import {
  type AgentActivity,
  type AgentConversation,
  anyAgentSeam,
} from "../src/agent";

const TURN_ERROR =
  "The coding agent could not complete the request. Check its authentication and try again.";

interface FakeEvent {
  type: string;
  [key: string]: unknown;
}

interface RunRequest {
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

function run(events: FakeEvent[], outcome: Record<string, unknown> | Error) {
  const promise =
    outcome instanceof Error
      ? Promise.reject(outcome)
      : Promise.resolve(outcome);
  return Object.assign(promise, {
    abort: vi.fn(),
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const event of events) {
        yield event;
      }
    },
  });
}

function fakeSession(outcome: Record<string, unknown> | Error = { text: "" }) {
  return {
    close: vi.fn(() => Promise.resolve()),
    respond: vi.fn(),
    run: vi.fn((_prompt: string, _request: RunRequest) => run([], outcome)),
    supports: vi.fn(() => false),
  };
}

const detectedResult = {
  id: "codex",
  name: "Codex",
  version: "1.2.3",
};

async function connect(session: object): Promise<AgentConversation> {
  mocks.detect.mockResolvedValue([detectedResult]);
  mocks.create.mockReturnValue({
    session: vi.fn(() => session),
    supports: vi.fn(() => true),
  });
  const seam = anyAgentSeam();
  const [detected] = await seam.detect();
  if (!detected) {
    throw new Error("Expected one detected agent");
  }
  return seam.open(detected, "/project");
}

describe("anyAgentSeam", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.detect.mockReset();
  });

  it("maps detection and streams activity from a turn", async () => {
    const runMock = vi.fn((_prompt: string, _request: RunRequest) =>
      run(
        [
          { name: "read", type: "tool-call" },
          { kind: "modify", path: "src/app.ts", type: "file-change" },
        ],
        { json: null, text: "## What I found\n\nA React app.\n" }
      )
    );
    const session = {
      close: vi.fn(),
      respond: vi.fn(),
      run: runMock,
      supports: vi.fn(() => false),
    };
    const agent = {
      session: vi.fn(() => session),
      supports: vi.fn(() => false),
    };
    mocks.detect.mockResolvedValue([detectedResult]);
    mocks.create.mockReturnValue(agent);
    const seam = anyAgentSeam();
    const [detected] = await seam.detect();

    expect(detected).toEqual({
      id: "codex",
      name: "Codex",
      version: "1.2.3",
    });
    if (!detected) {
      throw new Error("Expected one detected agent");
    }
    const activities: AgentActivity[] = [];
    const { signal } = new AbortController();
    const conversation = seam.open(detected, "/project");
    await expect(
      conversation.ask("inspect", {
        onActivity: (activity) => activities.push(activity),
        signal,
      })
    ).resolves.toEqual({
      json: null,
      text: "## What I found\n\nA React app.\n",
    });
    expect(agent.session).toHaveBeenCalledWith({ cwd: "/project" });
    expect(runMock).toHaveBeenCalledWith("inspect", { signal });
    expect(runMock.mock.calls[0]?.[1].signal).toBe(signal);
    expect(activities).toEqual([
      { input: undefined, kind: "tool", name: "read" },
      { change: "modify", kind: "file", path: "src/app.ts" },
    ]);
  });

  it("answers ACP permission requests so the run can finish", async () => {
    const session = {
      close: vi.fn(),
      respond: vi.fn(),
      run: vi.fn((_prompt: string, _request: RunRequest) =>
        run(
          [
            {
              requestId: "request-1",
              type: "permission-request",
            },
          ],
          { json: {}, text: "done" }
        )
      ),
      supports: vi.fn((capability) => capability === "respond"),
    };
    const { signal } = new AbortController();

    await expect(
      (await connect(session)).work("implement", { signal })
    ).resolves.toEqual({ json: {}, text: "done" });
    expect(session.respond).toHaveBeenCalledWith("request-1", "allow");
    expect(session.run).toHaveBeenCalledWith("implement", { signal });
    expect(session.run.mock.calls[0]?.[1].signal).toBe(signal);
  });

  it("never asks an agent to hold a turn to reading only", async () => {
    const session = fakeSession();
    const conversation = await connect(session);
    const { signal } = new AbortController();

    await conversation.ask("inspect", { signal });
    await conversation.work("implement", { signal });

    expect(session.run.mock.calls).toEqual([
      ["inspect", { signal }],
      ["implement", { signal }],
    ]);
    expect(session.run.mock.calls[0]?.[1].signal).toBe(signal);
    expect(session.run.mock.calls[1]?.[1].signal).toBe(signal);
  });

  it("hands the turn's schema to the agent as it is", async () => {
    const session = fakeSession({ json: { summary: "A site" }, text: "" });
    const schema = { properties: { summary: { type: "string" } } };

    await (await connect(session)).ask("x", { schema });

    expect(session.run.mock.calls[0]?.[1].schema).toBe(schema);
  });

  it("replaces upstream failures with actionable errors", async () => {
    const cause = new Error("private upstream detail");
    mocks.detect.mockRejectedValue(cause);

    await expect(anyAgentSeam().detect()).rejects.toMatchObject({
      cause,
      message:
        "Could not detect coding agents. Check that your coding agent is installed and available on PATH, then try again.",
    });
  });

  it("replaces a failed turn without showing what the agent said", async () => {
    const cause = new Error("private upstream detail");
    const conversation = await connect(fakeSession(cause));

    const error = await conversation
      .ask("inspect")
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ cause, message: TURN_ERROR });
    expect(String(error)).not.toContain("private upstream detail");
  });

  it("replaces a session that will not close", async () => {
    const cause = new Error("private upstream detail");
    const session = fakeSession();
    session.close.mockRejectedValue(cause);
    const conversation = await connect(session);

    await expect(conversation.close()).rejects.toMatchObject({
      cause,
      message:
        "Could not close the coding agent session. Stop the coding agent and try again.",
    });
  });

  it("will not open an agent that detection did not return", async () => {
    mocks.detect.mockResolvedValue([detectedResult]);
    const seam = anyAgentSeam();
    await seam.detect();

    expect(() => seam.open({ ...detectedResult }, "/project")).toThrow(
      "Could not start the coding agent. Detect installed agents again, then retry."
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("replaces a failure to start the agent", async () => {
    const cause = new Error("private upstream detail");
    mocks.detect.mockResolvedValue([detectedResult]);
    mocks.create.mockReturnValue({
      session: vi.fn(() => {
        throw cause;
      }),
      supports: vi.fn(() => false),
    });
    const seam = anyAgentSeam();
    const [detected] = await seam.detect();
    if (!detected) {
      throw new Error("Expected one detected agent");
    }

    expect(() => seam.open(detected, "/project")).toThrow(
      expect.objectContaining({
        cause,
        message:
          "Could not start Codex. Check that it is installed and authenticated, then try again.",
      })
    );
  });
});
