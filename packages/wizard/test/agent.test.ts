import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  detect: vi.fn(),
}));

vi.mock("anyagent-js", () => mocks);

import { type AgentActivity, anyAgentSeam } from "../src/agent";

interface FakeEvent {
  type: string;
  [key: string]: unknown;
}

function run(events: FakeEvent[], result: Record<string, unknown>) {
  const promise = Promise.resolve(result);
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

const detectedResult = {
  id: "codex",
  name: "Codex",
  version: "1.2.3",
};

describe("anyAgentSeam", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.detect.mockReset();
  });

  it("maps detection and streams activity from a read-only turn", async () => {
    const runMock = vi.fn(() =>
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
      supports: vi.fn((capability) => capability === "readOnly"),
    };
    mocks.detect.mockResolvedValue([detectedResult]);
    mocks.create.mockReturnValue(agent);
    const seam = anyAgentSeam();
    const [detected] = await seam.detect();

    expect(detected).toEqual({
      id: "codex",
      name: "Codex",
      supportsReadOnly: true,
      version: "1.2.3",
    });
    if (!detected) {
      throw new Error("Expected one detected agent");
    }
    const activities: AgentActivity[] = [];
    const conversation = seam.open(detected, "/project");
    await expect(
      conversation.ask("inspect", {
        onActivity: (activity) => activities.push(activity),
        readOnly: true,
      })
    ).resolves.toBe("## What I found\n\nA React app.\n");
    expect(agent.session).toHaveBeenCalledWith({ cwd: "/project" });
    expect(runMock).toHaveBeenCalledWith("inspect", {
      readOnly: true,
      signal: undefined,
    });
    expect(activities).toEqual([
      { kind: "tool", name: "read" },
      { change: "modify", kind: "file", path: "src/app.ts" },
    ]);
  });

  it("answers ACP permission requests so the run can finish", async () => {
    const session = {
      close: vi.fn(),
      respond: vi.fn(),
      run: vi.fn(() =>
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
    const agent = {
      session: vi.fn(() => session),
      supports: vi.fn(() => false),
    };
    mocks.detect.mockResolvedValue([detectedResult]);
    mocks.create.mockReturnValue(agent);
    const seam = anyAgentSeam();
    const [detected] = await seam.detect();
    if (!detected) {
      throw new Error("Expected one detected agent");
    }

    await expect(
      seam.open(detected, "/project").work("implement")
    ).resolves.toBe("done");
    expect(session.respond).toHaveBeenCalledWith("request-1", "allow");
    expect(session.run).toHaveBeenCalledWith("implement", {
      signal: undefined,
    });
  });

  it("does not send readOnly to an agent that cannot guarantee it", async () => {
    const session = {
      close: vi.fn(),
      respond: vi.fn(),
      run: vi.fn(() => run([], { json: {}, text: "" })),
      supports: vi.fn(() => false),
    };
    mocks.detect.mockResolvedValue([detectedResult]);
    mocks.create.mockReturnValue({
      session: vi.fn(() => session),
      supports: vi.fn(() => false),
    });
    const seam = anyAgentSeam();
    const [detected] = await seam.detect();
    if (!detected) {
      throw new Error("Expected one detected agent");
    }

    await seam.open(detected, "/project").ask("inspect", { readOnly: true });

    expect(session.run).toHaveBeenCalledWith("inspect", {
      signal: undefined,
    });
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
});
