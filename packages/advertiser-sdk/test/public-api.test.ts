import { describe, expect, it } from "vitest";

describe("advertiser public API", () => {
  it("exports only the browser client from the package root", async () => {
    expect(Object.keys(await import("../src"))).toEqual(["default"]);
  });

  it("exports capture and ValidationError from the server entry", async () => {
    expect(Object.keys(await import("../src/server")).sort()).toEqual([
      "ValidationError",
      "capture",
    ]);
  });

  it("refuses the browser entry in a React Server Component", async () => {
    await expect(import("../src/react-server")).rejects.toThrow(
      '@specify-sh/advertiser-sdk cannot be imported from a React Server Component. Import { capture } from "@specify-sh/advertiser-sdk/server" instead.'
    );
  });
});
