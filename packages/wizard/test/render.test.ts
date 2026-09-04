import { describe, expect, it } from "vitest";
import type { IntegrationPlan } from "../src/plan";
import { renderPlan } from "../src/render";

const UNDER_LABEL = /^ {12}\S/;

const plan: IntegrationPlan = {
  changes: [
    {
      action: "create",
      path: "lib/specify.ts",
      summary: "Creates the shared Specify client",
    },
    {
      action: "modify",
      path: "app/page.tsx",
      summary: "Renders the hero ad slot",
    },
  ],
  clientModule: { path: "lib/specify.ts", reason: "Imported everywhere" },
  consent: {
    decisionSite: "app/layout.tsx",
    platform: "Cookiebot",
    present: true,
  },
  envFile: { path: ".env.local", variable: "NEXT_PUBLIC_SPECIFY_KEY" },
  framework: "nextjs",
  frameworkNotes: "App Router",
  packageManager: "pnpm",
  placements: [
    {
      adUnitId: "home-hero",
      file: "app/page.tsx",
      imageFormat: "LANDSCAPE",
      reason: "Above the fold",
    },
  ],
  typescript: true,
  wallets: {
    connected: true,
    connectionSite: "components/connect.tsx",
    library: "wagmi",
  },
};

describe("renderPlan", () => {
  it("shows what was found and which files get touched", () => {
    const rendered = renderPlan(plan);

    expect(rendered).toContain("Next.js, TypeScript, pnpm");
    expect(rendered).toContain("App Router");
    expect(rendered).toContain("lib/specify.ts");
    expect(rendered).toContain(".env.local, NEXT_PUBLIC_SPECIFY_KEY");
    expect(rendered).toContain("Cookiebot, decided in app/layout.tsx");
    expect(rendered).toContain("wagmi, connected in components/connect.tsx");
    expect(rendered).toContain("app/page.tsx, LANDSCAPE, home-hero");
    expect(rendered).toContain("create  lib/specify.ts");
    expect(rendered).toContain("modify  app/page.tsx");
    expect(rendered).toContain("Renders the hero ad slot");
    expect(rendered).toContain("Nothing has been changed yet.");
  });

  it("says plainly when nothing was found", () => {
    const rendered = renderPlan({
      ...plan,
      consent: { decisionSite: null, platform: null, present: false },
      framework: "vanilla",
      frameworkNotes: "",
      placements: [],
      typescript: false,
      wallets: { connected: false, connectionSite: null, library: null },
    });

    expect(rendered).toContain("Vanilla JavaScript, JavaScript, pnpm");
    expect(rendered).toContain("None found, so consent is never set");
    expect(rendered).toContain("Wallets     None found");
    expect(rendered).toContain("None proposed");
    expect(rendered).not.toContain("Notes");
  });
});

describe("renderPlan wrapping", () => {
  it("keeps a long note and a long summary under their own label", () => {
    const rendered = renderPlan({
      ...plan,
      changes: [
        {
          action: "create",
          path: "src/lib/specify.js",
          summary:
            "Creates and exports the one shared Specify client, reading the publisher key from the environment so a development build and a production build pick up their own",
        },
      ],
      frameworkNotes:
        "Plain React with no bundler configuration, so the env variable prefix depends on the bundler this project eventually picks and should be confirmed",
    });

    for (const line of rendered.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
    const notes = rendered
      .split("\n")
      .filter((line) => line.includes("bundler"));
    expect(notes).toHaveLength(2);
    expect(notes[1]).toMatch(UNDER_LABEL);
    expect(
      rendered.split("\n").filter((line) => line.startsWith(" ".repeat(10)))
        .length
    ).toBeGreaterThan(1);
  });
});
