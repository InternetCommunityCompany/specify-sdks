import { describe, expect, it } from "vitest";
import { integrationPlanSchema, parseIntegrationPlan } from "../src/plan";

const validPlan = {
  changes: [{ action: "create", path: "src/ad.ts", summary: "Add ad" }],
  clientModule: { path: "src/specify.ts", reason: "Shared client" },
  consent: { decisionSite: null, platform: null, present: false },
  envFile: { path: ".env", variable: "SPECIFY_PUBLISHER_KEY" },
  framework: "react",
  frameworkNotes: "Vite application",
  packageManager: "bun",
  placements: [
    {
      adUnitId: "sidebar",
      file: "src/Sidebar.tsx",
      imageFormat: "LANDSCAPE",
      reason: "Visible placement",
    },
  ],
  typescript: true,
  wallets: {
    connected: true,
    connectionSite: "src/Wallet.tsx",
    library: "wagmi",
  },
};

describe("integration plan", () => {
  it("parses the complete structured result", () => {
    expect(parseIntegrationPlan(validPlan)).toEqual(validPlan);
  });

  it("rejects missing, extra, and unsupported values", () => {
    expect(() =>
      parseIntegrationPlan({ ...validPlan, unexpected: true })
    ).toThrow("Integration plan has an invalid shape.");
    expect(() =>
      parseIntegrationPlan({ ...validPlan, framework: "svelte" })
    ).toThrow("framework has an unsupported value.");
    expect(() =>
      parseIntegrationPlan({
        ...validPlan,
        consent: { platform: null, present: false },
      })
    ).toThrow("consent has an invalid shape.");
  });

  it("requires every schema property and rejects additional ones", () => {
    expect(integrationPlanSchema.additionalProperties).toBe(false);
    expect([...integrationPlanSchema.required].sort()).toEqual(
      Object.keys(integrationPlanSchema.properties).sort()
    );
    for (const property of Object.values(integrationPlanSchema.properties)) {
      if ("properties" in property) {
        expect(property.additionalProperties).toBe(false);
        expect([...property.required].sort()).toEqual(
          Object.keys(property.properties).sort()
        );
      }
      if ("items" in property) {
        expect(property.items.additionalProperties).toBe(false);
        expect([...property.items.required].sort()).toEqual(
          Object.keys(property.items.properties).sort()
        );
      }
    }
  });
});
