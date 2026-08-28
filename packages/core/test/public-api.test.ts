import { describe, expect, it } from "vitest";

describe("public API", () => {
  it("preserves the complete public surface", async () => {
    const publicApi = await import("../src");

    expect(Object.keys(publicApi).sort()).toEqual([
      "ImageFormat",
      "MAX_WALLET_ADDRESSES",
      "ValidationError",
      "assertValidAddresses",
      "assertValidPublisherKey",
      "prepareWalletAddresses",
      "requestAd",
    ]);
  });
});
