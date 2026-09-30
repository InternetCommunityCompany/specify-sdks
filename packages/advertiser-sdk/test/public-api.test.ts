import { describe, expect, it } from "vitest";

describe("advertiser SDK scaffold", () => {
  it("imports and runs its only export in the host environment", async () => {
    const sdk = await import("../src");

    expect(Object.keys(sdk)).toEqual(["health"]);
    expect(sdk.health()).toBe(true);
  });
});
