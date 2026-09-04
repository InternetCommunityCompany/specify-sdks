import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AgentSeam } from "../src/agent";
import { runWizard } from "../src/wizard";

function io() {
  let output = "";
  return {
    input: new PassThrough(),
    output: new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    }),
    text: () => output,
  };
}

function seam(agents: Awaited<ReturnType<AgentSeam["detect"]>>): AgentSeam {
  return {
    detect: vi.fn().mockResolvedValue(agents),
    open: vi.fn(),
  };
}

describe("runWizard", () => {
  it("prints the selected agent and working tree state", async () => {
    const terminal = io();

    await expect(
      runWizard({
        cwd: process.cwd(),
        ...terminal,
        seam: seam([
          {
            id: "codex",
            name: "Codex",
            supportsReadOnly: true,
            version: "1.2.3",
          },
        ]),
      })
    ).resolves.toBe(0);
    expect(terminal.text()).toContain("Found Codex");
    expect(terminal.text()).toContain("Codex 1.2.3");
    expect(terminal.text()).toContain("Working tree:");
  });

  it("points to manual setup when no agent is installed", async () => {
    const terminal = io();

    await expect(
      runWizard({ cwd: process.cwd(), ...terminal, seam: seam([]) })
    ).resolves.toBe(1);
    expect(terminal.text()).toContain("No supported coding agent was found");
    expect(terminal.text()).toContain(
      "https://docs.specify.sh/publishing/get-started"
    );
  });
});
