import { describe, expect, it } from "vitest";
import { PLAN_SCHEMA, placementLabel, readPlan } from "../src/plan";

const REPLY = {
  details: "## What I found\n\nA Next.js app.",
  placements: [
    { file: "app/page.tsx", reason: "the hero, above the fold" },
    { file: "app/blog/page.tsx", reason: "between the list and the footer" },
  ],
  summary: "A Next.js app that needs the client and one slot.",
};

describe("PLAN_SCHEMA", () => {
  it("requires the three fields the wizard reads", () => {
    expect(PLAN_SCHEMA.required).toEqual(["details", "placements", "summary"]);
    expect(PLAN_SCHEMA.properties.placements.items.required).toEqual([
      "file",
      "reason",
    ]);
  });

  it("keeps the plan body free-form so the agent can shape it", () => {
    expect(PLAN_SCHEMA.properties.details.type).toBe("string");
    expect(PLAN_SCHEMA.properties.details.description).toContain("markdown");
  });

  it("keeps placements out of the plan body, where the picker cannot see them", () => {
    expect(PLAN_SCHEMA.properties.details.description).toContain(
      "only in the placements field"
    );
  });
});

describe("readPlan", () => {
  it("reads a well-formed reply", () => {
    expect(readPlan(REPLY)).toEqual({
      details: "## What I found\n\nA Next.js app.",
      placements: [
        { file: "app/page.tsx", reason: "the hero, above the fold" },
        {
          file: "app/blog/page.tsx",
          reason: "between the list and the footer",
        },
      ],
      summary: "A Next.js app that needs the client and one slot.",
    });
  });

  it("accepts a plan that proposes no placement at all", () => {
    expect(readPlan({ ...REPLY, placements: [] })?.placements).toEqual([]);
  });

  it("drops a placement with no file rather than showing a blank choice", () => {
    const plan = readPlan({
      ...REPLY,
      placements: [{ reason: "somewhere" }, { file: "app/page.tsx" }],
    });

    expect(plan?.placements).toEqual([{ file: "app/page.tsx", reason: "" }]);
  });

  it("survives placements that are not objects", () => {
    expect(
      readPlan({ ...REPLY, placements: ["app/page.tsx", null, 3] })?.placements
    ).toEqual([]);
  });

  it("treats a reply with no plan body as no plan", () => {
    expect(readPlan({ ...REPLY, details: "   " })).toBeUndefined();
    expect(readPlan({ placements: [], summary: "x" })).toBeUndefined();
  });

  it("treats a reply that is not an object as no plan", () => {
    for (const reply of [undefined, null, "## What I found", 7, []]) {
      expect(readPlan(reply)).toBeUndefined();
    }
  });
});

describe("placementLabel", () => {
  it("reads as the file and the reason", () => {
    expect(placementLabel({ file: "app/page.tsx", reason: "the hero" })).toBe(
      "app/page.tsx - the hero"
    );
  });

  it("falls back to the file when there is no reason", () => {
    expect(placementLabel({ file: "app/page.tsx", reason: "" })).toBe(
      "app/page.tsx"
    );
  });
});
