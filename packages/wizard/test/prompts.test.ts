import { describe, expect, it } from "vitest";
import { feedbackPrompt, implementPrompt, reconPrompt } from "../src/prompts";

const INDEX = "# Specify\n\n- [Next.js](/publishing/nextjs): Add Specify.";
const BUNDLE = "# Next.js guide\n\nInstall @specify-sh/publisher-sdk.";
const DOCS = { index: INDEX };
const PLAN =
  "## What I found\n\nA Next.js app.\n\n## Placements\n- app/page.tsx";

describe("reconPrompt", () => {
  it("hands over the index and forbids changing anything", () => {
    const prompt = reconPrompt(DOCS);

    expect(prompt).toContain(INDEX);
    expect(prompt).toContain("https://docs.specify.sh/publishing/nextjs.md");
    expect(prompt).toContain("Propose placements rather than settling them");
    expect(prompt).toContain(
      "create, change, delete and install nothing until the developer has approved"
    );
  });

  it("asks for the plan without the agent's own progress commentary", () => {
    const prompt = reconPrompt(DOCS);

    expect(prompt).toContain("no progress commentary");
    expect(prompt).toContain("no narration of the files you opened");
  });
});

describe("reconPrompt with a bundle", () => {
  it("inlines the publishing docs and demotes fetching to a fallback", () => {
    const prompt = reconPrompt({ bundle: BUNDLE, index: INDEX });

    expect(prompt).toContain(
      `<specify-publishing-docs>\n${BUNDLE}\n</specify-publishing-docs>`
    );
    expect(prompt).toContain("included so you do not need to fetch it");
    expect(prompt).toContain(INDEX);
    expect(prompt).toContain("only when what you need is not included above");
  });
});

describe("implementPrompt with a bundle", () => {
  it("carries only the index, because the session already read the pages", () => {
    const prompt = implementPrompt({
      docs: { bundle: BUNDLE, index: INDEX },
      placements: { dropped: [], kept: [] },
      plan: PLAN,
    });

    expect(prompt).not.toContain(BUNDLE);
    expect(prompt).toContain(INDEX);
  });
});

describe("feedbackPrompt", () => {
  it("delimits the developer's words and asks for a whole plan", () => {
    const prompt = feedbackPrompt("Put the client in src/ads.ts");

    expect(prompt).toContain("<feedback>\nPut the client in src/ads.ts\n");
    expect(prompt).toContain("complete updated plan");
    expect(prompt).toContain("create, change, delete and install nothing yet");
  });
});

describe("implementPrompt", () => {
  it("puts the index ahead of the plan and keeps the two rules", () => {
    const prompt = implementPrompt({
      docs: DOCS,
      placements: { dropped: [], kept: ["app/page.tsx - hero"] },
      plan: PLAN,
    });

    expect(prompt.indexOf("<specify-docs-index>")).toBeLessThan(
      prompt.indexOf("<approved-plan>")
    );
    expect(prompt).toContain(INDEX);
    expect(prompt).toContain(PLAN);
    expect(prompt).toContain("Do not commit.");
    expect(prompt).toContain("Build these and no others:\n- app/page.tsx");
  });

  it("names the placements the developer dropped", () => {
    const prompt = implementPrompt({
      docs: DOCS,
      placements: { dropped: ["app/blog/page.tsx - sidebar"], kept: [] },
      plan: PLAN,
    });

    expect(prompt).toContain("wants none of the placements you proposed");
    expect(prompt).toContain("Do not add them:\n- app/blog/page.tsx - sidebar");
  });

  it("says nothing about placements when the plan proposed none", () => {
    const prompt = implementPrompt({
      docs: DOCS,
      placements: { dropped: [], kept: [] },
      plan: PLAN,
    });

    expect(prompt).not.toContain("placements you proposed");
    expect(prompt).not.toContain("Build these and no others");
  });

  it("always writes the placeholder, and never asks for a key", () => {
    const prompt = implementPrompt({
      docs: DOCS,
      placements: { dropped: [], kept: [] },
      plan: PLAN,
    });

    expect(prompt).toContain("has not given you a publisher key");
    expect(prompt).toContain("must not ask for one");
    expect(prompt).toContain(
      "Write spk_your_key_here into the env file the plan names"
    );
    expect(prompt).toContain("https://app.specify.sh/publish/publisher-keys");
    expect(prompt).toContain("Tell them in your final message which file");
  });

  it("carries only the rules the documentation does not hold", () => {
    const prompt = implementPrompt({
      docs: DOCS,
      placements: { dropped: [], kept: [] },
      plan: PLAN,
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
});
