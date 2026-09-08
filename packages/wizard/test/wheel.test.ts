import { describe, expect, it } from "vitest";
import { MOUSE_OFF, MOUSE_ON, wheelTurns } from "../src/ui/wheel";

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

describe("mouse mode sequences", () => {
  it("turns SGR button reporting on and back off, in reverse order", () => {
    expect(MOUSE_ON).toBe(`${ESC}[?1000h${ESC}[?1006h`);
    expect(MOUSE_OFF).toBe(`${ESC}[?1006l${ESC}[?1000l`);
  });
});
