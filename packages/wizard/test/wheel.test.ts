import { cleanup, render } from "ink-testing-library";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/ui/app";
import { WizardStore } from "../src/ui/store";
import { MOUSE_OFF, MOUSE_ON, wheelTurns } from "../src/ui/wheel";

afterEach(cleanup);

const ESC = "\u001B";
const wheelUp = `${ESC}[<64;10;5M`;
const wheelDown = `${ESC}[<65;10;5M`;

describe("wheelTurns", () => {
  it("reads a wheel notch in either direction", () => {
    expect(wheelTurns(wheelDown)).toBe(1);
    expect(wheelTurns(wheelUp)).toBe(-1);
  });

  it("nets out a chunk holding several events", () => {
    expect(wheelTurns(`${wheelDown}${wheelDown}${wheelUp}`)).toBe(1);
  });

  it("still reads the wheel with a modifier key held", () => {
    // Shift adds 4, Alt 8, Ctrl 16 to the button number.
    expect(wheelTurns(`${ESC}[<69;10;5M`)).toBe(1);
    expect(wheelTurns(`${ESC}[<80;10;5M`)).toBe(-1);
  });

  it("ignores clicks, releases, drags and horizontal wheels", () => {
    for (const other of [
      `${ESC}[<0;10;5M`,
      `${ESC}[<0;10;5m`,
      `${ESC}[<32;10;5M`,
      `${ESC}[<66;10;5M`,
      `${ESC}[<67;10;5M`,
    ]) {
      expect(wheelTurns(other)).toBe(0);
    }
  });

  it("ignores ordinary keyboard input", () => {
    expect(wheelTurns("hello")).toBe(0);
    expect(wheelTurns(`${ESC}[B`)).toBe(0);
    expect(wheelTurns("")).toBe(0);
  });
});

describe("mouse reporting", () => {
  it("is on while the plan is under review, and off once it is answered", async () => {
    const store = new WizardStore();
    const view = render(createElement(App, { mode: "publisher", store }));
    const decision = store.request<string>({
      kind: "review",
      message: "Go ahead with this plan?",
      options: [{ label: "Approve, make these changes", value: "approve" }],
      plan: {
        details: "## What I found\n\nA Next.js app.",
        suggestions: [],
        summary: "A Next.js app.",
      },
    });
    await vi.waitFor(() => expect(view.frames).toContain(MOUSE_ON));
    expect(view.frames).not.toContain(MOUSE_OFF);

    view.stdin.write("\r");

    await expect(decision).resolves.toBe("approve");
    await vi.waitFor(() => expect(view.frames).toContain(MOUSE_OFF));
    expect(view.frames.indexOf(MOUSE_OFF)).toBeGreaterThan(
      view.frames.indexOf(MOUSE_ON)
    );
  });
});
