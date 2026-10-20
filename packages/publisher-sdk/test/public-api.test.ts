import { describe, expect, it } from "vitest";
import { VALID_MOCK_PUBLISHER_KEY } from "./consts";

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
    const specify = new Specify({ publisherKey: VALID_MOCK_PUBLISHER_KEY });

    expect(specify.serve).toBeTypeOf("function");
    expect(specify.setCookieConsent).toBeTypeOf("function");
    expect(specify.hasCookieConsent).toBeTypeOf("function");
    expect(specify.identify).toBeTypeOf("function");
    expect(specify.onIdentityChange).toBeTypeOf("function");
  });
});
