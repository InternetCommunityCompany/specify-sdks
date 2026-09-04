import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AgentSeam } from "../src/agent";
import { runWizard } from "../src/cli";

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
      runWizard(
        [],
        terminal,
        seam([
          {
            id: "codex",
            name: "Codex",
            supportsReadOnly: true,
            version: "1.2.3",
          },
        ]),
        process.cwd()
      )
    ).resolves.toBe(0);
    expect(terminal.text()).toContain("Found Codex");
    expect(terminal.text()).toContain("Codex 1.2.3");
    expect(terminal.text()).toContain("Working tree:");
  });

  it("points to manual setup when no agent is installed", async () => {
    const terminal = io();

    await expect(runWizard([], terminal, seam([]))).resolves.toBe(1);
    expect(terminal.text()).toContain("No supported coding agent was found");
    expect(terminal.text()).toContain(
      "https://docs.specify.sh/publishing/get-started"
    );
  });

  it("explains that advertiser setup is not available", async () => {
    const terminal = io();
    const agentSeam = seam([]);

    await expect(
      runWizard(["--advertiser"], terminal, agentSeam)
    ).resolves.toBe(1);
    expect(agentSeam.detect).not.toHaveBeenCalled();
    expect(terminal.text()).toContain("Advertiser setup is not available yet");
    expect(terminal.text()).toContain(
      "https://docs.specify.sh/advertising/analytics-sdk-setup"
    );
  });
});
