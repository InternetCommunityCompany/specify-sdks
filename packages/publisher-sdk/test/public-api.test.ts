import { describe, expect, it } from "vitest";

describe("public API", () => {
  it("preserves the complete public surface", async () => {
    const publicApi = await import("../src");

    expect(Object.keys(publicApi).sort()).toEqual([
      "ImageFormat",
      "ValidationError",
      "default",
    ]);
    expect(publicApi.default).toBeTypeOf("function");
    expect(publicApi.default.name).toBe("Specify");
    expect(publicApi.ImageFormat).toEqual({
      LANDSCAPE: "LANDSCAPE",
      LONG_BANNER: "LONG_BANNER",
      NO_IMAGE: "NO_IMAGE",
      SHORT_BANNER: "SHORT_BANNER",
    });
    expect(new publicApi.ValidationError("message").name).toBe(
      "ValidationError"
    );
  });

  it("exposes the instance methods", async () => {
    const { default: Specify } = await import("../src");

    expect(Specify.prototype.setCookieConsent).toBeTypeOf("function");
    expect(Specify.prototype.hasCookieConsent).toBeTypeOf("function");
    expect(Specify.prototype.identify).toBeTypeOf("function");
  });
});
