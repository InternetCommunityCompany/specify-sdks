const ESC = "\u001B";
/** One SGR mouse report: `ESC [ < button ; column ; row (M|m)`. */
const SGR_MOUSE = new RegExp(
  `${ESC}${String.raw`\[<(?<button>\d+);\d+;\d+(?<press>[Mm])`}`,
  "gu"
);
/** Wheel buttons are 64-95: 64 up, 65 down, plus 4, 8 or 16 per modifier. */
const WHEEL_FIRST = 64;
const WHEEL_LAST = 95;
/** Modifiers are multiples of 4, so the direction survives a remainder. */
const UP = 0;
const DOWN = 1;

/**
 * The net wheel movement in a chunk of terminal input, in notches: positive
 * is down, negative is up, zero when the chunk holds no wheel event. Button
 * presses, drags and horizontal wheels count for nothing.
 *
 * @param chunk Raw bytes from stdin while SGR mouse reporting is on.
 * @returns How far the wheel moved, down being positive.
 */
export function wheelTurns(chunk: string): number {
  let turns = 0;
  for (const match of chunk.matchAll(SGR_MOUSE)) {
    const button = Number(match.groups?.button);
    if (
      match.groups?.press !== "M" ||
      button < WHEEL_FIRST ||
      button > WHEEL_LAST
    ) {
      continue;
    }
    const direction = (button - WHEEL_FIRST) % 4;
    if (direction === UP) {
      turns -= 1;
    } else if (direction === DOWN) {
      turns += 1;
    }
  }
  return turns;
}

/**
 * The control sequences that turn button reporting on and off, in SGR
 * encoding so coordinates past column 223 still parse. A terminal without
 * mouse support ignores them, and the wheel falls back to whatever it did
 * before.
 */
export const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
export const MOUSE_OFF = `${ESC}[?1006l${ESC}[?1000l`;
