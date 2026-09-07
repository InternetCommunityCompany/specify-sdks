import { describe, expect, it } from "vitest";
import { renderPlan } from "../src/render";

const LONG_LINE =
  "The home page renders above the fold, so an ad there is seen before the visitor scrolls, and it is the one placement worth having on every visit.";

describe("renderPlan", () => {
  it("keeps the markdown it was given", () => {
    const rendered = renderPlan(
      "## What I found\n\nA Next.js app.\n\n## Placements\n- `app/page.tsx`\n"
    );

    expect(rendered).toBe(
      "## What I found\n\nA Next.js app.\n\n## Placements\n- `app/page.tsx`"
    );
  });

  it("folds a long line under its own indent", () => {
    const rendered = renderPlan(`## Placements\n  - ${LONG_LINE}`);

    for (const line of rendered.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
    const [, ...continuations] = rendered
      .split("\n")
      .filter((line) => line.includes("the"));
    expect(continuations.length).toBeGreaterThan(0);
    for (const line of continuations) {
      expect(line.startsWith("  ")).toBe(true);
    }
  });

  it("keeps a word that is longer than the width on its own line", () => {
    const word = "a".repeat(80);

    expect(renderPlan(`- ${word}`)).toBe(`- ${word}`);
  });
});
