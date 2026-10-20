import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardOptions } from "../src/wizard";

const mocks = vi.hoisted(() => ({
  anyAgentSeam: vi.fn(),
  runWizard: vi.fn(),
  startUi: vi.fn(),
}));

vi.mock("../src/agent", () => ({ anyAgentSeam: mocks.anyAgentSeam }));
vi.mock("../src/ui/host", () => ({ startUi: mocks.startUi }));
vi.mock("../src/wizard", () => ({ runWizard: mocks.runWizard }));

import { runCli } from "../src/main";

const FLAG_ERROR =
  "Use --publisher, --advertiser, --verbose, --help, or --version.\n";
const { version } = JSON.parse(
  readFileSync(resolve("packages/wizard/package.json"), "utf8")
);

const stdinWasTTY = process.stdin.isTTY;
let stdout: string[];
let stderr: string[];

function capture(stream: NodeJS.WriteStream): string[] {
  const written: string[] = [];
  vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
    written.push(String(chunk));
    return true;
  });
  return written;
}

beforeEach(() => {
  mocks.anyAgentSeam.mockReset();
  mocks.runWizard.mockReset();
  mocks.startUi.mockReset();
  stdout = capture(process.stdout);
  stderr = capture(process.stderr);
  process.stdin.isTTY = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.stdin.isTTY = stdinWasTTY;
});

describe("runCli", () => {
  it.each([[["--nope"]], [["--publisher", "--advertiser"]]])(
    "refuses %j with exit code 1",
    async (argv) => {
      await expect(runCli(argv)).resolves.toBe(1);

      expect(stderr).toEqual([FLAG_ERROR]);
      expect(mocks.startUi).not.toHaveBeenCalled();
    }
  );

  it.each(["--help", "-h"])("prints usage for %s", async (flag) => {
    await expect(runCli([flag])).resolves.toBe(0);

    expect(stdout.join("")).toContain(
      "Usage: specify-wizard [--publisher | --advertiser] [--verbose]\n"
    );
    expect(stdout.join("")).toContain("--advertiser  Add the advertiser SDK");
    expect(mocks.startUi).not.toHaveBeenCalled();
  });

  it.each(["--version", "-v"])("prints the version for %s", async (flag) => {
    await expect(runCli([flag])).resolves.toBe(0);

    expect(stdout).toEqual([`${version}\n`]);
    expect(mocks.startUi).not.toHaveBeenCalled();
  });

  it.each([
    { argv: [], guide: "https://docs.specify.sh/publishing/get-started" },
    {
      argv: ["--advertiser"],
      guide: "https://docs.specify.sh/advertising/javascript",
    },
  ])(
    "names the manual guide when stdin is not a terminal ($argv)",
    async ({ argv, guide }) => {
      process.stdin.isTTY = false;

      await expect(runCli(argv)).resolves.toBe(1);

      expect(stderr.join("")).toContain("needs a real terminal");
      expect(stderr.join("")).toContain(guide);
      expect(mocks.startUi).not.toHaveBeenCalled();
    }
  );

  it("stops the run on SIGINT while it runs, and closes the screen after", async () => {
    const before = process.listeners("SIGINT");
    const ui = { close: vi.fn(() => Promise.resolve()) };
    mocks.startUi.mockReturnValue(ui);
    let added: NodeJS.SignalsListener[] = [];
    let stopped: boolean | undefined;
    let closedDuringRun: number | undefined;
    mocks.runWizard.mockImplementation((options: WizardOptions) => {
      added = process.listeners("SIGINT").filter((l) => !before.includes(l));
      for (const listener of added) {
        listener("SIGINT");
      }
      stopped = options.signal?.aborted;
      closedDuringRun = ui.close.mock.calls.length;
      return Promise.resolve(0);
    });

    await expect(runCli(["--advertiser", "--verbose"])).resolves.toBe(0);

    expect(added).toHaveLength(1);
    expect(stopped).toBe(true);
    expect(process.listeners("SIGINT")).toEqual(before);
    expect(closedDuringRun).toBe(0);
    expect(ui.close).toHaveBeenCalledOnce();
    expect(mocks.runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "advertiser", ui, verbose: true })
    );
  });

  it("removes the handler and closes the screen when the run throws", async () => {
    const before = process.listeners("SIGINT");
    const ui = { close: vi.fn(() => Promise.resolve()) };
    mocks.startUi.mockReturnValue(ui);
    mocks.runWizard.mockRejectedValue(new Error("The run broke."));

    await expect(runCli([])).resolves.toBe(1);

    expect(stderr).toEqual(["The run broke.\n"]);
    expect(process.listeners("SIGINT")).toEqual(before);
    expect(ui.close).toHaveBeenCalledOnce();
  });
});
