import { describe, expect, it } from "vitest";
import { feedbackPrompt, implementPrompt, reconPrompt } from "../src/prompts";

const PUBLISHER_INDEX =
  "# Specify\n\n- [Next.js](/publishing/nextjs): Add Specify.";
const PUBLISHER_BUNDLE =
  "# Next.js guide\n\nInstall @specify-sh/publisher-sdk.";
const PUBLISHER_DOCS = { index: PUBLISHER_INDEX };
const PUBLISHER_PLAN =
  "## What I found\n\nA Next.js app.\n\n## Placements\n- app/page.tsx";

describe("reconPrompt (publisher)", () => {
  it("hands over the index and forbids changing anything", () => {
    const prompt = reconPrompt(PUBLISHER_DOCS, "publisher");

    expect(prompt).toContain(PUBLISHER_INDEX);
    expect(prompt).toContain("https://docs.specify.sh/publishing/nextjs.md");
    expect(prompt).toContain("Propose placements rather than settling them");
    expect(prompt).toContain(
      "create, change, delete and install nothing until the developer has approved"
    );
  });

  it("asks for the plan without the agent's own progress commentary", () => {
    const prompt = reconPrompt(PUBLISHER_DOCS, "publisher");

    expect(prompt).toContain("no progress commentary");
    expect(prompt).toContain("no narration of the files you opened");
  });
});

describe("reconPrompt with a bundle (publisher)", () => {
  it("inlines the publishing docs and demotes fetching to a fallback", () => {
    const prompt = reconPrompt(
      { bundle: PUBLISHER_BUNDLE, index: PUBLISHER_INDEX },
      "publisher"
    );

    expect(prompt).toContain(
      `<specify-publishing-docs>\n${PUBLISHER_BUNDLE}\n</specify-publishing-docs>`
    );
    expect(prompt).toContain("included so you do not need to fetch it");
    expect(prompt).toContain(PUBLISHER_INDEX);
    expect(prompt).toContain("only when what you need is not included above");
  });
});

describe("implementPrompt with a bundle (publisher)", () => {
  it("carries only the index, because the session already read the pages", () => {
    const prompt = implementPrompt({
      docs: { bundle: PUBLISHER_BUNDLE, index: PUBLISHER_INDEX },
      mode: "publisher",
      plan: PUBLISHER_PLAN,
      suggestions: { dropped: [], kept: [] },
    });

    expect(prompt).not.toContain(PUBLISHER_BUNDLE);
    expect(prompt).toContain(PUBLISHER_INDEX);
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

describe("implementPrompt (publisher)", () => {
  it("puts the index ahead of the plan and keeps the two rules", () => {
    const prompt = implementPrompt({
      docs: PUBLISHER_DOCS,
      mode: "publisher",
      plan: PUBLISHER_PLAN,
      suggestions: { dropped: [], kept: ["app/page.tsx - hero"] },
    });

    expect(prompt.indexOf("<specify-docs-index>")).toBeLessThan(
      prompt.indexOf("<approved-plan>")
    );
    expect(prompt).toContain(PUBLISHER_INDEX);
    expect(prompt).toContain(PUBLISHER_PLAN);
    expect(prompt).toContain("Do not commit.");
    expect(prompt).toContain("Build these and no others:\n- app/page.tsx");
  });

  it("names the placements the developer dropped", () => {
    const prompt = implementPrompt({
      docs: PUBLISHER_DOCS,
      mode: "publisher",
      plan: PUBLISHER_PLAN,
      suggestions: { dropped: ["app/blog/page.tsx - sidebar"], kept: [] },
    });

    expect(prompt).toContain("wants none of the placements you proposed");
    expect(prompt).toContain("Do not add them:\n- app/blog/page.tsx - sidebar");
  });

  it("says nothing about placements when the plan proposed none", () => {
    const prompt = implementPrompt({
      docs: PUBLISHER_DOCS,
      mode: "publisher",
      plan: PUBLISHER_PLAN,
      suggestions: { dropped: [], kept: [] },
    });

    expect(prompt).not.toContain("placements you proposed");
    expect(prompt).not.toContain("Build these and no others");
  });

  it("always writes the placeholder, and never asks for a key", () => {
    const prompt = implementPrompt({
      docs: PUBLISHER_DOCS,
      mode: "publisher",
      plan: PUBLISHER_PLAN,
      suggestions: { dropped: [], kept: [] },
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
      docs: PUBLISHER_DOCS,
      mode: "publisher",
      plan: PUBLISHER_PLAN,
      suggestions: { dropped: [], kept: [] },
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

describe("advertiser prompts", () => {
  const ADVERTISER_INDEX =
    "# Specify\n\n- [Advertiser SDK setup](/advertising/analytics-sdk-setup): Capture events.";
  const ADVERTISER_DOCS = { index: ADVERTISER_INDEX };
  const bundle = "# Advertiser SDK\n\nInstall @specify-sh/advertiser-sdk.";

  it("uses the same read, plan and approval instructions for event capture", () => {
    const prompt = reconPrompt(
      { bundle, index: ADVERTISER_INDEX },
      "advertiser"
    );

    expect(prompt).toContain("add the Specify advertiser SDK");
    expect(prompt).toContain(
      `<specify-advertising-docs>\n${bundle}\n</specify-advertising-docs>`
    );
    expect(prompt).toContain("Propose events rather than settling them");
    expect(prompt).toContain(
      "existing consent, user identity and wallet handling"
    );
    expect(prompt).toContain("browser or server code");
    expect(prompt).toContain(
      "create, change, delete and install nothing until the developer has approved"
    );
    expect(prompt).toContain("no progress commentary");
    expect(prompt).not.toContain("Propose placements");
  });

  it("points to advertiser markdown when the bundle is unavailable", () => {
    const prompt = reconPrompt(ADVERTISER_DOCS, "advertiser");

    expect(prompt).toContain(
      "https://docs.specify.sh/advertising/analytics-sdk-setup.md"
    );
    expect(prompt).toContain(
      "follow the import paths, names and options exactly"
    );
  });

  it("implements only chosen events and leaves an advertiser key placeholder", () => {
    const prompt = implementPrompt({
      docs: { bundle, index: ADVERTISER_INDEX },
      mode: "advertiser",
      plan: "Wire consent and identity into the existing app.",
      suggestions: {
        dropped: ["signup - app/signup.ts - after registration succeeds"],
        kept: ["purchase - app/checkout.ts - after payment succeeds"],
      },
    });

    expect(prompt).toContain("chose these events. Build these and no others:");
    expect(prompt).toContain(
      "- purchase - app/checkout.ts - after payment succeeds"
    );
    expect(prompt).toContain("Do not add them:\n- signup - app/signup.ts");
    expect(prompt).toContain("has not given you an advertiser key");
    expect(prompt).toContain("must not ask for one");
    expect(prompt).toContain("Write sak_your_key_here into the env file");
    expect(prompt).toContain(
      "https://app.specify.sh/advertise/advertiser-keys"
    );
    expect(prompt).toContain("No git commit, no git push, no pull request");
    expect(prompt).not.toContain(bundle);
    expect(prompt).not.toContain("spk_your_key_here");
  });

  it("still wires the SDK when all proposed events are declined", () => {
    const prompt = implementPrompt({
      docs: ADVERTISER_DOCS,
      mode: "advertiser",
      plan: "Wire the client.",
      suggestions: { dropped: ["purchase"], kept: [] },
    });

    expect(prompt).toContain("wants none of the events you proposed");
    expect(prompt).toContain("add no event captures at all");
    expect(prompt).not.toContain("ad slots");
  });
});
