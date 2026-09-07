import { describe, expect, it } from "vitest";
import {
  feedbackPrompt,
  implementPrompt,
  PLACEHOLDER_PUBLISHER_KEY,
  reconPrompt,
} from "../src/prompts";

const INDEX = "# Specify\n\n- [Next.js](/publishing/nextjs): Add Specify.";
const PLAN =
  "## What I found\n\nA Next.js app.\n\n## Placements\n- app/page.tsx";

describe("reconPrompt", () => {
  it("hands over the index and asks for markdown, not a schema", () => {
    const prompt = reconPrompt(INDEX);

    expect(prompt).toContain(INDEX);
    expect(prompt).toContain("https://docs.specify.sh/publishing/nextjs.md");
    expect(prompt).toContain("## Placements");
    expect(prompt).toContain("a suggestion, not a requirement");
    expect(prompt).toContain("Reply with markdown and nothing else.");
    expect(prompt).toContain("Propose placements rather than settling them");
    expect(prompt).toContain(
      "create, change, delete and install nothing until the developer has approved"
    );
    expect(prompt).not.toContain("schema");
  });
});

describe("feedbackPrompt", () => {
  it("delimits the developer's words and asks for a whole plan", () => {
    const prompt = feedbackPrompt("Put the client in src/ads.ts");

    expect(prompt).toContain("<feedback>\nPut the client in src/ads.ts\n");
    expect(prompt).toContain("complete updated plan in markdown");
    expect(prompt).toContain("create, change, delete and install nothing yet");
    expect(prompt).not.toContain("schema");
  });
});

describe("implementPrompt", () => {
  it("puts the index ahead of the plan and keeps the two rules", () => {
    const prompt = implementPrompt({
      index: INDEX,
      placements: { dropped: [], kept: ["`app/page.tsx` - hero"] },
      plan: PLAN,
      publisherKey: "spk_live_key",
    });

    expect(prompt.indexOf("<specify-docs-index>")).toBeLessThan(
      prompt.indexOf("<approved-plan>")
    );
    expect(prompt).toContain(INDEX);
    expect(prompt).toContain(PLAN);
    expect(prompt).toContain(
      "Write the publisher key spk_live_key into the env file the plan names."
    );
    expect(prompt).toContain("Do not commit.");
    expect(prompt).toContain("Build these and no others:\n- `app/page.tsx`");
  });

  it("names the placements the developer dropped", () => {
    const prompt = implementPrompt({
      index: INDEX,
      placements: { dropped: ["`app/blog/page.tsx` - sidebar"], kept: [] },
      plan: PLAN,
      publisherKey: "spk_live_key",
    });

    expect(prompt).toContain("wants none of the placements you proposed");
    expect(prompt).toContain(
      "Do not add them:\n- `app/blog/page.tsx` - sidebar"
    );
  });

  it("says nothing about placements when the plan proposed none", () => {
    const prompt = implementPrompt({
      index: INDEX,
      placements: { dropped: [], kept: [] },
      plan: PLAN,
      publisherKey: "spk_live_key",
    });

    expect(prompt).not.toContain("placements");
  });

  it("carries only the two rules the documentation does not hold", () => {
    const prompt = implementPrompt({
      index: INDEX,
      placements: { dropped: [], kept: [] },
      plan: PLAN,
      publisherKey: "spk_live_key",
    });

    for (const removed of [
      "Consent starts as false",
      "React Server Component",
      "identify(address)",
      "LANDSCAPE",
      "adUnitId",
      "return null",
    ]) {
      expect(prompt).not.toContain(removed);
    }
  });

  it("asks for a replaceable placeholder when the key was skipped", () => {
    const prompt = implementPrompt({
      index: INDEX,
      placements: { dropped: [], kept: [] },
      plan: PLAN,
      publisherKey: PLACEHOLDER_PUBLISHER_KEY,
    });

    expect(prompt).toContain(
      "Write spk_your_key_here into the env file the plan names"
    );
    expect(prompt).toContain("https://app.specify.sh/publish/publisher-keys");
  });
});
