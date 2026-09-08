import { describe, expect, it } from "vitest";
import type { AgentActivity } from "../src/agent";
import { createNarrator, describeActivity } from "../src/narration";

const CWD = "/home/dev/project";

function tool(name: string, input: unknown): AgentActivity {
  return { input, kind: "tool", name };
}

describe("describeActivity", () => {
  it("names the file a tool touched, relative to the project", () => {
    expect(
      describeActivity(tool("read", { path: `${CWD}/app/page.tsx` }), CWD)
    ).toBe("Read app/page.tsx");
  });

  it("reads file_path as well as path", () => {
    expect(
      describeActivity(tool("edit", { file_path: "app/layout.tsx" }), CWD)
    ).toBe("Edited app/layout.tsx");
  });

  it("shows the command a shell tool ran", () => {
    expect(
      describeActivity(tool("bash", { command: "bun install" }), CWD)
    ).toBe("Ran bun install");
  });

  it("shows the pattern a search ran", () => {
    expect(describeActivity(tool("grep", { pattern: "specify" }), CWD)).toBe(
      "Searched specify"
    );
  });

  it("passes an unknown tool through under its own name", () => {
    expect(describeActivity(tool("WebFetch", "https://docs"), CWD)).toBe(
      "WebFetch https://docs"
    );
  });

  it("shows the verb alone when there is nothing worth showing", () => {
    expect(describeActivity(tool("read", { limit: 20 }), CWD)).toBe("Read");
  });

  it("flattens and truncates a long command onto one line", () => {
    const line = describeActivity(
      tool("bash", { command: `echo one\n  echo ${"x".repeat(200)}` }),
      CWD
    );

    expect(line.split("\n")).toHaveLength(1);
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line.endsWith("…")).toBe(true);
  });

  it("names a file change by what it did", () => {
    expect(
      describeActivity(
        { change: "create", kind: "file", path: `${CWD}/lib/specify.ts` },
        CWD
      )
    ).toBe("Created lib/specify.ts");
    expect(
      describeActivity({ change: "delete", kind: "file", path: "old.ts" }, CWD)
    ).toBe("Deleted old.ts");
  });
});

describe("createNarrator", () => {
  it("counts every step and the distinct files behind them", () => {
    const narrator = createNarrator(CWD);

    narrator.take(tool("read", { path: "package.json" }));
    narrator.take({ change: "create", kind: "file", path: "lib/specify.ts" });
    narrator.take({ change: "modify", kind: "file", path: "lib/specify.ts" });
    narrator.take({ change: "modify", kind: "file", path: "app/page.tsx" });

    expect(narrator.summary()).toBe("4 steps, 2 files");
  });

  it("says nothing about files when the turn only read", () => {
    const narrator = createNarrator(CWD);
    narrator.take(tool("read", { path: "package.json" }));

    expect(narrator.summary()).toBe("1 step");
  });

  it("returns the line for each activity it counts", () => {
    const narrator = createNarrator(CWD);

    expect(narrator.take(tool("bash", { command: "git status" }))).toBe(
      "Ran git status"
    );
  });

  it("starts empty", () => {
    expect(createNarrator(CWD).summary()).toBe("0 steps");
  });
});
