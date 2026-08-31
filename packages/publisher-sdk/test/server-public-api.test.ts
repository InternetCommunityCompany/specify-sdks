import { describe, expect, it } from "vitest";

describe("server public API", () => {
  it("exposes the complete server surface", async () => {
    const publicApi = await import("../src/server");

    expect(Object.keys(publicApi).sort()).toEqual([
      "ImageFormat",
      "ValidationError",
      "serve",
    ]);
    expect(publicApi.serve).toBeTypeOf("function");
  });

  it("rejects the browser entry from a React Server Component", async () => {
    await expect(import("../src/react-server")).rejects.toThrow(
      '@specify-sh/publisher-sdk cannot be imported from a React Server Component. Import { serve } from "@specify-sh/publisher-sdk/server" instead.'
    );
  });
});
