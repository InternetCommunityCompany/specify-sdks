import { describe, expect, it } from "vitest";
import {
  ADVERTISER_PLAN_SCHEMA,
  PUBLISHER_PLAN_SCHEMA,
  placementLabel,
  readPlan,
} from "../src/plan";

const PUBLISHER_REPLY = {
  details: "## What I found\n\nA Next.js app.",
  placements: [
    { file: "app/page.tsx", reason: "the hero, above the fold" },
    { file: "app/blog/page.tsx", reason: "between the list and the footer" },
  ],
  summary: "A Next.js app that needs the client and one slot.",
};

describe("PUBLISHER_PLAN_SCHEMA", () => {
  it("requires the three fields the wizard reads", () => {
    expect(PUBLISHER_PLAN_SCHEMA.required).toEqual([
      "details",
      "placements",
      "summary",
    ]);
    expect(PUBLISHER_PLAN_SCHEMA.properties.placements.items.required).toEqual([
      "file",
      "reason",
    ]);
  });

  it("keeps the plan body free-form so the agent can shape it", () => {
    expect(PUBLISHER_PLAN_SCHEMA.properties.details.type).toBe("string");
    expect(PUBLISHER_PLAN_SCHEMA.properties.details.description).toContain(
      "markdown"
    );
  });

  it("keeps placements out of the plan body, where the picker cannot see them", () => {
    expect(PUBLISHER_PLAN_SCHEMA.properties.details.description).toContain(
      "only in the placements field"
    );
  });
});

describe("readPlan (publisher)", () => {
  it("reads a well-formed reply", () => {
    expect(readPlan(PUBLISHER_REPLY, "publisher")).toEqual({
      details: "## What I found\n\nA Next.js app.",
      suggestions: [
        "app/page.tsx - the hero, above the fold",
        "app/blog/page.tsx - between the list and the footer",
      ],
      summary: "A Next.js app that needs the client and one slot.",
    });
  });

  it("accepts a plan that proposes no placement at all", () => {
    expect(
      readPlan({ ...PUBLISHER_REPLY, placements: [] }, "publisher")?.suggestions
    ).toEqual([]);
  });

  it("drops a placement with no file rather than showing a blank choice", () => {
    const plan = readPlan(
      {
        ...PUBLISHER_REPLY,
        placements: [{ reason: "somewhere" }, { file: "app/page.tsx" }],
      },
      "publisher"
    );

    expect(plan?.suggestions).toEqual(["app/page.tsx"]);
  });

  it("survives placements that are not objects", () => {
    expect(
      readPlan(
        { ...PUBLISHER_REPLY, placements: ["app/page.tsx", null, 3] },
        "publisher"
      )?.suggestions
    ).toEqual([]);
  });

  it("treats a reply with no plan body as no plan", () => {
    expect(
      readPlan({ ...PUBLISHER_REPLY, details: "   " }, "publisher")
    ).toBeUndefined();
    expect(
      readPlan({ placements: [], summary: "x" }, "publisher")
    ).toBeUndefined();
  });

  it("treats a reply that is not an object as no plan", () => {
    for (const reply of [undefined, null, "## What I found", 7, []]) {
      expect(readPlan(reply, "publisher")).toBeUndefined();
    }
  });
});

describe("advertiser plans", () => {
  const event = {
    file: "app/checkout.ts",
    name: "purchase",
    reason: "measure completed orders",
    trigger: "on the server after checkout succeeds",
  };

  it("asks for selectable events separately from the plan", () => {
    expect(ADVERTISER_PLAN_SCHEMA.required).toEqual([
      "details",
      "events",
      "summary",
    ]);
    expect(ADVERTISER_PLAN_SCHEMA.properties.events.items.required).toEqual([
      "file",
      "name",
      "reason",
      "trigger",
    ]);
    expect(ADVERTISER_PLAN_SCHEMA.properties.details.description).toContain(
      "only in the events field"
    );
  });

  it("keeps each event's name, file, trigger and reason in its choice", () => {
    expect(
      readPlan({ ...PUBLISHER_REPLY, events: [event] }, "advertiser")
        ?.suggestions
    ).toEqual([
      "purchase - app/checkout.ts - on the server after checkout succeeds - measure completed orders",
    ]);
  });

  it("drops incomplete events and never uses publisher placements", () => {
    expect(
      readPlan(
        {
          ...PUBLISHER_REPLY,
          events: [
            null,
            "purchase",
            { ...event, name: "" },
            { ...event, file: "" },
            { ...event, trigger: "" },
          ],
        },
        "advertiser"
      )?.suggestions
    ).toEqual([]);
    expect(readPlan(PUBLISHER_REPLY, "advertiser")?.suggestions).toEqual([]);
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
